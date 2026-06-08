# PLEAS

## How to Run

1. Clone the repository (if not already done)
2. Navigate to the project directory
3. Create a virtual environment (optional but recommended):
   python3 -m venv venv
4. Activate the virtual environment:
   source venv/bin/activate   # On Windows: venv\Scripts\activate
5. Install dependencies:
   pip install -r requirements.txt
6. Apply migrations:
   python backend/manage.py migrate
7. Start the development server:
   python backend/manage.py runserver
8. Open your browser and go to http://127.0.0.1:8000/
