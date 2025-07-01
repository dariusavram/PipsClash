// In your project, save this file as:
// netlify/
//   functions/
//     cancel-challenge.js

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

        // Find the challenge and verify the creator and status
        const challengeQuery = 'SELECT creator_id, status FROM challenges WHERE id = $1';
        const challengeResult = await client.query(challengeQuery, [challengeId]);

        if (challengeResult.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Challenge not found.' }) };
        }
        
        const challenge = challengeResult.rows[0];

        if (challenge.creator_id !== userId) {
            return { statusCode: 403, body: JSON.stringify({ message: 'Only the creator can cancel the challenge.' }) };
        }

        if (challenge.status !== 'pending') {
            return { statusCode: 400, body: JSON.stringify({ message: 'Cannot cancel a challenge that is already active or finished.' }) };
        }

        // Delete the challenge. The ON DELETE CASCADE constraint will handle participants.
        const deleteQuery = 'DELETE FROM challenges WHERE id = $1';
        await client.query(deleteQuery, [challengeId]);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Challenge cancelled successfully!' }),
        };

    } catch (error) {
        console.error('Cancel Challenge Error:', error);
        if (error.name === 'JsonWebTokenError') {
             return { statusCode: 401, body: JSON.stringify({ message: 'Invalid token.' }) };
        }
        return { statusCode: 500, body: JSON.stringify({ message: 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
