import google.generativeai as genai
import logging
from PIL import Image
import os
import sys
import json
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'utils')))


api_key = ""

class GenAIRequestModel:
    def __init__(self, image=None, prompt: str = "", repo_name: str = "", error_message: str = ""):
        self.image = image
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
        logging.info("Configuring Gemini AI API...")
        genai.configure(api_key=self.api_key)
        logging.info("Gemini AI API configured successfully.")

    def generate_response(self, request: GenAIRequestModel) -> str:
        """Generate a response using Gemini AI."""
        logging.info("Generating response using Gemini AI...")
        try:
            model = genai.GenerativeModel(model_name="models/gemini-1.5-flash")
            
            response = model.generate_content([request.prompt])
            logging.info("Response generated successfully.", response)
            return response.text
        except Exception as e:
            logging.error(f"Error generating response: {e}")
            return ""
        
    def clean_response(self, response) -> str:
        """Clean the response by removing unnecessary formatting."""
        logging.info("Cleaning the response...")
        cleaned_response = response.replace("```json", "").replace("```", "").replace("\\\\n", "").replace("\\n", "").strip()
        logging.info(f"Cleaned response: {cleaned_response}")
        return cleaned_response
    
    def generate_fix(self, repo_name: str, error_message: str, prompt: str) -> str:
        """Generate a fix using Gemini AI based on repository, error, and custom prompt.
        
        Args:
            repo_name: Name of the repository
            error_message: The error message to fix
            prompt: Custom prompt for fix generation
            
        Returns:
            Generated fix response as string
        """
        logging.info(f"Generating fix for repo: {repo_name}, error: {error_message}")
        try:
            # Construct the complete prompt with context
            full_prompt = f"""Repository: {repo_name}
Error Message: {error_message}

Task: {prompt}

Please provide a comprehensive solution."""
            
            request = GenAIRequestModel(prompt=full_prompt, repo_name=repo_name, error_message=error_message)
            response = self.generate_response(request)
            cleaned = self.clean_response(response)
            logging.info(f"Fix generated successfully for {repo_name}")
            return cleaned
        except Exception as e:
            logging.error(f"Error generating fix: {e}")
            return f"Error generating fix: {str(e)}"

# Example usage:
if __name__ == "__main__":
    image_path = os.path.join(os.path.dirname(__file__), "./HITEC_Diego Acosta.png")
    my_prompt = "In given content, line 2 is designation. extract text and create json {\"designation\":\"\"}" 
