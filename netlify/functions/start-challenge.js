// In your project, save this file as:
// netlify/
//   functions/
//     start-challenge.js

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
        const { challengeId } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ message: 'No token provided.' }) };
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId } = decoded;

        // Check if the user is the creator of the challenge
        const challengeQuery = 'SELECT creator_id FROM challenges WHERE id = $1';
        const challengeResult = await client.query(challengeQuery, [challengeId]);

        if (challengeResult.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Challenge not found.' }) };
        }
        
        const challenge = challengeResult.rows[0];

        if (challenge.creator_id !== userId) {
            return { statusCode: 403, body: JSON.stringify({ message: 'Only the creator can start the challenge.' }) };
        }

        // Update the challenge status to 'active'
        const updateQuery = `
            UPDATE challenges
            SET status = 'active', started_at = NOW()
            WHERE id = $1 AND status = 'pending'
            RETURNING id, status;
        `;
        const updateResult = await client.query(updateQuery, [challengeId]);

        if (updateResult.rows.length === 0) {
            throw new Error('Challenge could not be started. It might already be active or finished.');
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Challenge started successfully!', challenge: updateResult.rows[0] }),
        };
    } catch (error) {
        console.error('Start Challenge Error:', error);
        if (error.name === 'JsonWebTokenError') {
             return { statusCode: 401, body: JSON.stringify({ message: 'Invalid token.' }) };
        }
        return { statusCode: 500, body: JSON.stringify({ message: error.message || 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
