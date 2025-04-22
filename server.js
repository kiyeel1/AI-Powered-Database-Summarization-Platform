const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'user_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Ollama API URL - allow for different ports and hosts
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
// Default model to use
const DEFAULT_MODEL = 'gemma:2b';

console.log(`Using Ollama API URL: ${OLLAMA_API_URL}`);
console.log(`Default model: ${DEFAULT_MODEL}`);

// Function to check if Ollama is available
async function isOllamaAvailable() {
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/tags`);
    return response.ok;
  } catch (error) {
    console.error('Ollama availability check failed:', error.message);
    return false;
  }
}

// Function to generate text using Ollama API directly
async function generateWithOllama(model, prompt) {
  try {
    console.log(`Sending request to Ollama API at ${OLLAMA_API_URL}/api/generate`);
    console.log(`Using model: ${model}`);
    
    const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error('Generate with Ollama failed:', error);
    throw error;
  }
}

// Function to chat using Ollama API directly
async function chatWithOllama(model, messages) {
  try {
    console.log(`Sending request to Ollama API at ${OLLAMA_API_URL}/api/chat`);
    console.log(`Using model: ${model}`);
    
    const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.message.content;
  } catch (error) {
    console.error('Chat with Ollama failed:', error);
    throw error;
  }
}

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    res.json({ message: 'Database connection successful' });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ error: 'Database connection failed', details: error.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

// Get a single user by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
});

// Create a new user
app.post('/api/users', async (req, res) => {
  const { name, email, date_of_birth, phone_number } = req.body;
  
  // Validate required fields
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  try {
    const [result] = await pool.query(
      'INSERT INTO users (name, email, date_of_birth, phone_number) VALUES (?, ?, ?, ?)',
      [name, email, date_of_birth, phone_number]
    );
    
    const newUserId = result.insertId;
    const [newUser] = await pool.query('SELECT * FROM users WHERE id = ?', [newUserId]);
    
    res.status(201).json(newUser[0]);
  } catch (error) {
    console.error('Error creating user:', error);
    
    // Handle duplicate email error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
});

// Update a user
app.put('/api/users/:id', async (req, res) => {
  const { name, email, date_of_birth, phone_number } = req.body;
  const userId = req.params.id;
  
  // Validate required fields
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  try {
    const [result] = await pool.query(
      'UPDATE users SET name = ?, email = ?, date_of_birth = ?, phone_number = ? WHERE id = ?',
      [name, email, date_of_birth, phone_number, userId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const [updatedUser] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    res.json(updatedUser[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    
    // Handle duplicate email error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    res.status(500).json({ error: 'Failed to update user', details: error.message });
  }
});

// Delete a user
app.delete('/api/users/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
});

// Chat with AI
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  try {
    // Check if Ollama is available
    const ollamaAvailable = await isOllamaAvailable();
    
    if (!ollamaAvailable) {
      return res.json({ 
        response: "I'm sorry, the AI service is currently unavailable. Please make sure Ollama is running.",
        status: "error",
        details: "Ollama service not available"
      });
    }
    
    try {
      // Use the chat API
      const aiResponse = await chatWithOllama(DEFAULT_MODEL, [
        { role: 'user', content: message }
      ]);
      
      res.json({ response: aiResponse });
    } catch (chatError) {
      console.error('Chat with Ollama failed:', chatError);
      
      // Try the generate API as fallback
      try {
        const generatedResponse = await generateWithOllama(DEFAULT_MODEL, message);
        res.json({ response: generatedResponse });
      } catch (generateError) {
        console.error('Generate with Ollama failed:', generateError);
        res.json({ 
          response: "I'm sorry, I couldn't process your request. The AI service is experiencing issues.",
          status: "error",
          details: generateError.message
        });
      }
    }
  } catch (error) {
    console.error('Error getting AI response:', error);
    res.status(500).json({ error: 'Failed to get AI response', details: error.message });
  }
});

// Generate summary - this is the endpoint our frontend expects
app.post('/api/generate-summary', async (req, res) => {
  const { model, prompt, data } = req.body;
  const modelToUse = model || DEFAULT_MODEL;
  
  if (!prompt || !data || !Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'Valid prompt and data array are required' });
  }
  
  try {
    // Check if Ollama is available
    const ollamaAvailable = await isOllamaAvailable();
    
    if (!ollamaAvailable) {
      // Provide a fallback summary if Ollama is not available
      const fallbackSummary = `Summary of ${data.length} users:\n\n` + 
        data.map(user => `- ${user.name} (${user.email})`).join('\n') +
        "\n\nNote: This is a basic fallback summary as the AI service is currently unavailable.";
      
      return res.json({ 
        summary: fallbackSummary,
        status: "fallback",
        message: "Ollama service not available. Using fallback summary."
      });
    }
    
    // Format user data for the AI
    const userSummary = data.map(user => 
      `Name: ${user.name}, Email: ${user.email}, DOB: ${user.date_of_birth || 'Not provided'}, Phone: ${user.phone_number || 'Not provided'}`
    ).join('\n');
    
    const fullPrompt = `${prompt}\n\nUser data:\n${userSummary}`;
    
    console.log('Generating summary with model:', modelToUse);
    
    try {
      // Try using the chat API first
      const summaryText = await chatWithOllama(modelToUse, [
        { role: 'user', content: fullPrompt }
      ]);
      
      res.json({ summary: summaryText });
    } catch (chatError) {
      console.error('Chat with Ollama failed:', chatError);
      
      // Try the generate API as fallback
      try {
        const generatedSummary = await generateWithOllama(modelToUse, fullPrompt);
        res.json({ summary: generatedSummary });
      } catch (generateError) {
        console.error('Generate with Ollama failed:', generateError);
        
        // Provide a fallback summary if all else fails
        const fallbackSummary = `Summary of ${data.length} users:\n\n` + 
          data.map(user => `- ${user.name} (${user.email})`).join('\n') +
          "\n\nNote: This is a basic fallback summary as the AI service encountered an error.";
        
        res.json({ 
          summary: fallbackSummary,
          status: "error",
          message: generateError.message
        });
      }
    }
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ 
      error: 'Failed to generate summary', 
      details: error.message,
      suggestion: 'Please check if Ollama is running and accessible'
    });
  }
});

// Keep the original /api/summary endpoint for backward compatibility
app.post('/api/summary', async (req, res) => {
  const { prompt, users } = req.body;
  
  // Forward to the new endpoint
  req.body.data = users;
  req.body.model = DEFAULT_MODEL;
  
  return app._router.handle(req, res);
});

// Test Ollama connection
app.get('/api/test-ollama', async (req, res) => {
  try {
    let status = 'unknown';
    let message = '';
    let availableModels = [];
    
    try {
      // Try to ping the Ollama API directly
      const response = await fetch(`${OLLAMA_API_URL}/api/tags`);
      
      if (response.ok) {
        const data = await response.json();
        status = 'connected';
        
        if (data.models) {
          availableModels = data.models.map(m => m.name);
          message = `Ollama is running. Available models: ${availableModels.join(', ')}`;
        } else {
          message = 'Ollama is running but no models were found.';
        }
        
        // Check specifically for our default model
        if (availableModels.includes(DEFAULT_MODEL)) {
          message += ` ${DEFAULT_MODEL} model is available.`;
        } else {
          message += ` WARNING: ${DEFAULT_MODEL} model is NOT available. You need to pull it with "ollama pull ${DEFAULT_MODEL}".`;
        }
      } else {
        status = 'error';
        message = `Ollama API returned status ${response.status}: ${response.statusText}`;
      }
    } catch (error) {
      status = 'error';
      message = `Failed to connect to Ollama at ${OLLAMA_API_URL}: ${error.message}`;
    }
    
    res.json({ 
      status,
      message,
      ollamaUrl: OLLAMA_API_URL,
      defaultModel: DEFAULT_MODEL,
      availableModels
    });
  } catch (error) {
    console.error('Error testing Ollama connection:', error);
    res.status(500).json({ error: 'Failed to test Ollama connection', details: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Ollama API URL: ${OLLAMA_API_URL}`);
  console.log(`Default model: ${DEFAULT_MODEL}`);
  
  // Check Ollama availability on startup
  isOllamaAvailable().then(available => {
    if (available) {
      console.log('✅ Successfully connected to Ollama API');
      
      // Check if the model is available
      fetch(`${OLLAMA_API_URL}/api/tags`)
        .then(response => response.json())
        .then(data => {
          if (data.models && Array.isArray(data.models)) {
            const modelNames = data.models.map(m => m.name);
            if (modelNames.includes(DEFAULT_MODEL)) {
              console.log(`✅ ${DEFAULT_MODEL} model is available`);
            } else {
              console.log(`⚠️ WARNING: ${DEFAULT_MODEL} model is NOT available`);
              console.log(`Run this command to download it: ollama pull ${DEFAULT_MODEL}`);
            }
          }
        })
        .catch(err => {
          console.error('Error checking available models:', err);
        });
    } else {
      console.log('⚠️ WARNING: Could not connect to Ollama API. Make sure Ollama is running.');
      console.log(`Attempted to connect to: ${OLLAMA_API_URL}`);
      console.log('To install Ollama, visit: https://ollama.ai/download');
      console.log(`After installing, run: ollama pull ${DEFAULT_MODEL}`);
    }
  });
});