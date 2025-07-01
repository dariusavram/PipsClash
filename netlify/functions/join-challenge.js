// In your project, save this file as:
// netlify/
//   functions/
//     join-challenge.js

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
        const { challengeCode } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ message: 'No token provided.' }) };
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId } = decoded;

        // Find the challenge by code
        const challengeQuery = 'SELECT id, status, start_amount FROM challenges WHERE challenge_code = $1';
        const challengeResult = await client.query(challengeQuery, [challengeCode]);

        if (challengeResult.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Challenge code not found.' }) };
        }

        const challenge = challengeResult.rows[0];

        if (challenge.status !== 'pending') {
            return { statusCode: 400, body: JSON.stringify({ message: 'This challenge has already started or is finished.' }) };
        }
        
        // Check if user is already a participant in the participants table
        const participantCheckQuery = 'SELECT user_id FROM participants WHERE challenge_id = $1 AND user_id = $2';
        const participantResult = await client.query(participantCheckQuery, [challenge.id, userId]);

        if (participantResult.rows.length > 0) {
            return { statusCode: 409, body: JSON.stringify({ message: "You've already joined this challenge." }) };
        }
        
        // Add user to the separate participants table for tracking balance
        const insertParticipantQuery = `
            INSERT INTO participants (challenge_id, user_id, balance)
            VALUES ($1, $2, $3)
        `;
        await client.query(insertParticipantQuery, [challenge.id, userId, challenge.start_amount]);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Successfully joined the challenge!' }),
        };

    } catch (error) {
        console.error('Join Challenge Error:', error);
        if (error.name === 'JsonWebTokenError') {
             return { statusCode: 401, body: JSON.stringify({ message: 'Invalid token.' }) };
        }
        return { statusCode: 500, body: JSON.stringify({ message: 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
