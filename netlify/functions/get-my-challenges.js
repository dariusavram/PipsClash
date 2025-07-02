// In your project, save this file as:
// netlify/functions/get-my-challenges.js

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
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const client = await pool.connect();
    try {
        const token = event.headers.authorization.split(' ')[1];
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ message: 'No token provided.' }) };
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId } = decoded;

        const query = `
            SELECT 
                c.id, 
                c.creator_id,
                c.challenge_code, 
                c.start_amount, 
                c.time_limit_days, 
                c.max_loss_percent, 
                c.status,
                c.is_public,
                u.username as creator_username,
                (SELECT json_agg(json_build_object('uid', p_user.id, 'username', p_user.username)) 
                 FROM participants p_inner 
                 JOIN users p_user ON p_inner.user_id = p_user.id 
                 WHERE p_inner.challenge_id = c.id) as participants
            FROM challenges c
            JOIN users u ON c.creator_id = u.id
            JOIN participants p ON c.id = p.challenge_id
            WHERE p.user_id = $1
            ORDER BY c.created_at DESC;
        `;
        const result = await client.query(query, [userId]);
        
        return {
            statusCode: 200,
            body: JSON.stringify(result.rows),
        };
    } catch (error) {
        console.error('Get My Challenges Error:', error);
        if (error.name === 'JsonWebTokenError') {
             return { statusCode: 401, body: JSON.stringify({ message: 'Invalid token.' }) };
        }
        return { statusCode: 500, body: JSON.stringify({ message: 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
