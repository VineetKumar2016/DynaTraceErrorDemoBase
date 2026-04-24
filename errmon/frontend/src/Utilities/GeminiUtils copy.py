import google.generativeai as genai
import logging
from PIL import Image
import os
import sys
import json
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'utils')))

class GenAIRequestModel:
    def __init__(self, prompt: str = "", repo_name: str = "", error_message: str = ""):
        self.prompt = prompt
        self.repo_name = repo_name
        self.error_message = error_message
class GenAIClient:
    """Client for interacting with Gemini AI."""
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.configure()

    def configure(self):
        """Configure the Gemini AI API."""
        print("Configuring Gemini AI API...",self.api_key)
        genai.configure(api_key=self.api_key)
        logging.info("Gemini AI API configured successfully.")

    def generate_response(self, request: GenAIRequestModel) -> str:
        """Generate a response using Gemini AI."""
        logging.info("Generating response using Gemini AI...")
        try:
            # models = genai.list_models()
            # print(f"Available Gemini models: {[model.name for model in models]}")
            # model = genai.GenerativeModel(model_name="models/gemini-1.5-flash")
            model = genai.GenerativeModel(model_name="models/gemini-flash-latest")
            # model = genai.GenerativeModel(model_name="gemini-2.0-flash")
            print("FILTER :: generate_response ::Gemini AI API...",self.api_key)
            response = model.generate_content([request.prompt])
            print("FILTER :: Response from Gemini AI:", response.text)
            # logging.info("FILTER :: Response generated successfully.", response)
            return response.text
        except Exception as e:
            logging.error(f"Error generating response: {e}")
            return ""
        
    def generate_fix(self, repo_name: str, error_message: str, prompt: str) -> str:
        """Generate a fix using Gemini AI based on repository, error, and custom prompt.
        
        Args:
            repo_name: Name of the repository
            error_message: The error message to fix
            prompt: Custom prompt for fix generation
            
        Returns:
            Generated fix response as string (preferably JSON)
        """
        try:
            print("Repo name:", repo_name)
            request = GenAIRequestModel(prompt=prompt, repo_name=repo_name, error_message=error_message)
            logging.info(f"Generating fix for repo: {repo_name}")
            response = self.generate_response(request)
            logging.info(f"Fix generated successfully for {repo_name}")
            return response
        except Exception as e:
            logging.error(f"Error generating fix: {e}")
            return json.dumps({
                "rca": "Error generating AI response",
                "explanation": str(e),
                "severity": "high",
                "proposed_changes": [],
                "testing_notes": "Manual fix required due to AI generation error"
            })

# Example usage:
if __name__ == "__main__":
    image_path = os.path.join(os.path.dirname(__file__), "./HITEC_Diego Acosta.png")
    my_prompt = "In given content, line 2 is designation. extract text and create json {\"designation\":\"\"}" 
