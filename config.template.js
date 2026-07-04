/**
 * Application Configuration Template
 * INSTRUCTIONS:
 * 1. Copy this file and rename it to 'config.js'
 * 2. Replace all placeholder values with your actual API keys
 * 3. The config.js file is already in .gitignore and won't be committed to GitHub
 * 
 * DO NOT COMMIT THIS FILE WITH REAL KEYS TO VERSION CONTROL
 */

export const CONFIG = {
    // Gemini AI Configuration
    GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE",
    PROJECT_NUMBER: "YOUR_PROJECT_NUMBER_HERE",
    MODEL: "gemini-2.5-flash",

    // OpenAI Configuration (Optional - only if you use OpenAI features)
    OPENAI_API_KEY: "YOUR_OPENAI_API_KEY_HERE",
    OPENAI_MODEL: "gpt-4o-mini",

    // Firebase Configuration
    FIREBASE_CONFIG: {
        apiKey: "YOUR_FIREBASE_API_KEY_HERE",
        authDomain: "your-project.firebaseapp.com",
        projectId: "your-project-id",
        storageBucket: "your-project.firebasestorage.app",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID",
        measurementId: "YOUR_MEASUREMENT_ID"
    }
};
