// In your project, create a directory structure like this:
// netlify/
//   functions/
//     register.js
//
// You will need to install the necessary packages:
// npm install pg bcryptjs

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// The connection string should be stored as an environment variable in Netlify, not hardcoded.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
}); 

// Helper to generate a random friend code
const generateFriendCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'friend-';
    for (let i = 0; i < 9; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};


exports.handler = async (event, context) => {
    // We only accept POST requests for registration
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { username, password } = JSON.parse(event.body);

        // --- Input Validation ---
        if (!username || !password) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Username and password are required.' }) };
        }
        if (password.length < 6) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Password must be at least 6 characters long.' }) };
        }
        if (username.length < 3) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Username must be at least 3 characters long.' }) };
        }

        const client = await pool.connect();

        try {
            // --- Check if username already exists ---
            const existingUser = await client.query('SELECT id FROM users WHERE username = $1', [username]);
            if (existingUser.rows.length > 0) {
                return { statusCode: 409, body: JSON.stringify({ message: 'Username is already taken.' }) };
            }

            // --- Hash the password ---
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            // --- Create new user ---
            const friendCode = generateFriendCode();
            const newUserQuery = `
                INSERT INTO users (username, password_hash, friend_code)
                VALUES ($1, $2, $3)
                RETURNING id, username, created_at;
            `;
            const newUserResult = await client.query(newUserQuery, [username, passwordHash, friendCode]);
            const newUser = newUserResult.rows[0];

            return {
                statusCode: 201, // 201 Created
                body: JSON.stringify({ 
                    message: 'User created successfully!',
                    user: {
                        id: newUser.id,
                        username: newUser.username,
                        createdAt: newUser.created_at
                    }
                }),
            };

        } finally {
            // Release the client back to the pool
            client.release();
        }

    } catch (error) {
        console.error('Registration Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'An internal server error occurred.' }),
        };
    }
};
