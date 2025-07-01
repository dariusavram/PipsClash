// In your project, save this file as:
// netlify/
//   functions/
//     add-friend.js

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-super-secret-key-for-local-testing';

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const client = await pool.connect();
    try {
        const { friendCode } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ message: 'No token provided.' }) };
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId } = decoded;

        // Find the friend by their code
        const friendQuery = 'SELECT id FROM users WHERE friend_code = $1';
        const friendResult = await client.query(friendQuery, [friendCode]);

        if (friendResult.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Friend code not found.' }) };
        }

        const friendId = friendResult.rows[0].id;

        if (friendId === userId) {
            return { statusCode: 400, body: JSON.stringify({ message: "You can't add yourself as a friend." }) };
        }

        // Insert friendship record
        // The PRIMARY KEY on (user_id_1, user_id_2) will prevent duplicates.
        const insertFriendQuery = `
            INSERT INTO friends (user_id_1, user_id_2) VALUES ($1, $2), ($2, $1)
            ON CONFLICT DO NOTHING;
        `;
        await client.query(insertFriendQuery, [userId, friendId]);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Friend added successfully!' }),
        };

    } catch (error) {
        console.error('Add Friend Error:', error);
        if (error.name === 'JsonWebTokenError') {
             return { statusCode: 401, body: JSON.stringify({ message: 'Invalid token.' }) };
        }
        return { statusCode: 500, body: JSON.stringify({ message: 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
