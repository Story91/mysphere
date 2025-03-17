@echo off
cd Based-Agent-Demo-1 (1)/Based-Agent-Demo-1
python -m venv venv
call venv\Scripts\activate
pip install -r requirements.txt
python app.py 