// Configuration file for MatchaGig Frontend
// Update these values for your deployment environment

export const CONFIG = {
  // Backend API base URL
  // For local development: 'http://localhost:8787'
  // For production: 'https://matchagig-backend-production.up.railway.app'
  BACKEND_URL: 'https://matchagig-backend-production.up.railway.app',
  
  // API endpoints
  ENDPOINTS: {
    BULK_ZIP: '/v1/bulk-zip',
    CHAT_SEED: '/v1/chat/seed',
    CHAT_ASK: '/v1/chat/ask'
  },
  
  // Feature flags
  FEATURES: {
    DEBUG_MODE: false,  // Set to true to enable debug logging
    SHOW_LOADING_STATES: true
  }
};

// Helper function to get full API URL
export function getApiUrl(endpoint) {
  return CONFIG.BACKEND_URL + endpoint;
}
