// In your project, save this file as:
// netlify/
//   functions/
//     login.js

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // You will need to run: npm install jsonwebtoken

// The connection string and JWT secret should be stored as environment variables in Netlify.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key-for-local-testing';

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { username, password } = JSON.parse(event.body);

        if (!username || !password) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Username and password are required.' }) };
        }

        const client = await pool.connect();

        try {
            // --- Find the user by username ---
            const userResult = await client.query('SELECT id, username, password_hash, friend_code FROM users WHERE username = $1', [username]);
            if (userResult.rows.length === 0) {
                return { statusCode: 401, body: JSON.stringify({ message: 'Invalid credentials.' }) };
            }
            
            const user = userResult.rows[0];

            // --- Compare the provided password with the stored hash ---
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                return { statusCode: 401, body: JSON.stringify({ message: 'Invalid credentials.' }) };
            }

            // --- Generate a JSON Web Token (JWT) ---
            const token = jwt.sign(
                { userId: user.id, username: user.username }, 
                JWT_SECRET, 
                { expiresIn: '1h' } // Token expires in 1 hour
            );

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Login successful!',
                    token: token,
                    user: {
                        id: user.id,
                        username: user.username,
                        friendCode: user.friend_code
                    }
                }),
            };

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Login Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'An internal server error occurred.' }),
        };
    }
};
