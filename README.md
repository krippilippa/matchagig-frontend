# MatchaGig Frontend

A simple MVP frontend for bulk resume processing and candidate evaluation.

## Project Structure

```
matchagig-frontend/
├── index.html          # Main HTML file
├── css/
│   └── styles.css     # All CSS styling
├── js/
│   ├── main.js        # Main application logic and DOM setup
│   ├── database.js    # IndexedDB operations
│   ├── api.js         # Backend API calls
│   ├── chat.js        # Chat functionality
│   └── utils.js       # Helper functions and utilities
└── README.md          # This file
```

## Features

- **Bulk Resume Processing**: Upload multiple PDFs and process them via bulk-zip endpoint
- **Candidate Ranking**: View candidates ranked by cosine similarity scores
- **PDF Preview**: View uploaded resumes in the browser
- **LLM Explanations**: Get AI-powered candidate assessments
- **Chat Interface**: Interactive chat with different modes (interview questions, email templates, etc.)
- **Local Storage**: Persist data using IndexedDB and localStorage
- **JD Hash Management**: Link job descriptions to candidate evaluations

## Usage

1. **Setup**: Open `index.html` in a modern browser
2. **Job Description**: Paste the job description text and/or enter a JD hash
3. **Upload Resumes**: Select multiple PDF files
4. **Process**: Click "Zip & Send to /v1/bulk-zip" to process resumes
5. **Evaluate**: Click on candidates to view PDFs and get LLM explanations
6. **Chat**: Use the chat interface for interactive candidate evaluation

## Dependencies

- **JSZip**: For creating zip files in the browser (loaded via CDN)
- **Modern Browser**: Requires ES6 modules support

## Backend Endpoints

- `POST /v1/bulk-zip`: Bulk resume processing
- `POST /v1/explain-llm`: Generate candidate explanations
- `POST /v1/chat`: Interactive chat with candidates

## Development

This is an MVP with no build tools required. Simply edit the JavaScript files and refresh the browser to see changes.

### File Responsibilities

- **`main.js`**: Application entry point, DOM setup, event orchestration
- **`database.js`**: IndexedDB operations for storing resume data
- **`api.js`**: HTTP requests to backend endpoints
- **`chat.js`**: Chat functionality and message handling
- **`utils.js`**: Helper functions, rendering, and utility operations
