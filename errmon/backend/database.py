import json
import re
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data.json"


class DBProxy:
    """Proxy that forwards attribute access to the underlying db target.
    Allows all modules that imported `db` to keep their reference while
    init_db() swaps the underlying implementation at startup."""
    def __init__(self):
        object.__setattr__(self, "_target", None)

    def _set(self, target):
        object.__setattr__(self, "_target", target)

    def __getattr__(self, name):
        target = object.__getattribute__(self, "_target")
        if target is None:
            raise RuntimeError("Database not initialized yet")
        return getattr(target, name)

    async def command(self, cmd):
        target = object.__getattribute__(self, "_target")
        if target is None:
            raise RuntimeError("Database not initialized yet")
        return await target.command(cmd)


db = DBProxy()


async def init_db():
    file_db = FileDB(DATA_FILE)
    db._set(file_db)
    print(f"FileDB initialized: {DATA_FILE}")


class FileDB:
    """Persistent JSON file-backed database."""

    def __init__(self, path: Path):
        self._path = path
        self._raw = {}
        self._collections = {}
        self._load()

    def _load(self):
        if self._path.exists():
            try:
                with open(self._path, "r", encoding="utf-8") as f:
                    self._raw = json.load(f)
            except Exception as e:
                print(f"[FileDB] could not load {self._path}: {e} — starting fresh")
                self._raw = {}

    def _save(self):
        try:
            with open(self._path, "w", encoding="utf-8") as f:
                json.dump(self._raw, f, indent=2, default=str)
        except Exception as e:
            print(f"[FileDB] save error: {e}")

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        if name not in self._collections:
            if name not in self._raw:
                self._raw[name] = {}
            self._collections[name] = FileCollection(name, self._raw[name], self._save)
        return self._collections[name]

    async def command(self, cmd):
        return {"ok": 1}


class FileCollection:
    def __init__(self, name, docs_dict, save_fn):
        self.name = name
        self._docs = docs_dict
        self._save = save_fn
        nums = [int(k) for k in docs_dict if str(k).isdigit()]
        self._counter = max(nums, default=0)

    async def find_one(self, query=None, *args, **kwargs):
        if not query:
            return next(iter(self._docs.values()), None)
        for doc in self._docs.values():
            if self._matches(doc, query):
                return doc
        return None

    def find(self, query=None, *args, **kwargs):
        return FileCursor(self._docs, query)

    async def insert_one(self, doc):
        self._counter += 1
        doc_id = str(self._counter)
        doc["_id"] = doc_id
        self._docs[doc_id] = doc
        self._save()
        return type("Result", (), {"inserted_id": doc_id})()

    async def update_one(self, query, update, upsert=False):
        for doc in self._docs.values():
            if self._matches(doc, query):
                if "$set" in update:
                    doc.update(update["$set"])
                self._save()
                return type("Result", (), {"modified_count": 1, "upserted_id": None})()
        if upsert:
            new_doc = {}
            if "$setOnInsert" in update:
                new_doc.update(update["$setOnInsert"])
            if "$set" in update:
                new_doc.update(update["$set"])
            result = await self.insert_one(new_doc)
            return type("Result", (), {"modified_count": 0, "upserted_id": result.inserted_id})()
        return type("Result", (), {"modified_count": 0, "upserted_id": None})()

    async def delete_one(self, query):
        for k, doc in list(self._docs.items()):
            if self._matches(doc, query):
                del self._docs[k]
                self._save()
                return type("Result", (), {"deleted_count": 1})()
        return type("Result", (), {"deleted_count": 0})()

    async def delete_many(self, query):
        to_del = [k for k, doc in list(self._docs.items()) if self._matches(doc, query)]
        for k in to_del:
            del self._docs[k]
        if to_del:
            self._save()
        return type("Result", (), {"deleted_count": len(to_del)})()

    async def count_documents(self, query=None):
        if not query:
            return len(self._docs)
        return sum(1 for d in self._docs.values() if self._matches(d, query))

    async def create_index(self, *args, **kwargs):
        pass  # no-op; indexes not needed for file store

    def _matches(self, doc, query):
        for k, v in query.items():
            if k == "_id":
                if doc.get("_id") != str(v) and doc.get("_id") != v:
                    return False
            elif isinstance(v, dict):
                doc_val = doc.get(k)
                if "$in" in v and doc_val not in v["$in"]:
                    return False
                if "$regex" in v:
                    if not re.search(v["$regex"], str(doc_val or ""), re.IGNORECASE):
                        return False
                if "$gte" in v and (doc_val is None or doc_val < v["$gte"]):
                    return False
                if "$lt" in v and (doc_val is None or doc_val >= v["$lt"]):
                    return False
            elif doc.get(k) != v:
                return False
        return True


class FileCursor:
    def __init__(self, docs, query):
        self._docs = list(docs.values())
        self._query = query
        self._sort_key = None
        self._limit_val = None
        self._skip_val = 0

    def sort(self, key, direction=-1):
        self._sort_key = (key, direction)
        return self

    def limit(self, n):
        self._limit_val = n
        return self

    def skip(self, n):
        self._skip_val = n
        return self

    def _filtered(self):
        results = self._docs
        if self._query:
            col = FileCollection("", {}, lambda: None)
            results = [d for d in results if col._matches(d, self._query)]
        if self._sort_key:
            k, d = self._sort_key
            results = sorted(results, key=lambda x: x.get(k) or "", reverse=(d == -1))
        if self._skip_val:
            results = results[self._skip_val:]
        if self._limit_val:
            results = results[:self._limit_val]
        return results

    def __aiter__(self):
        return self._async_iter()

    async def _async_iter(self):
        for doc in self._filtered():
            yield doc

    async def to_list(self, length=None):
        results = self._filtered()
        if length:
            results = results[:length]
        return results
