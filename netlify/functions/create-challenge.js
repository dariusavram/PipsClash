// In your project, save this file as:
// netlify/
//   functions/
//     create-challenge.js

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-super-secret-key-for-local-testing';

const generateChallengeCode = () => {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const client = await pool.connect();
    try {
        const { startAmount, timeLimit, maxLossPercent } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ message: 'No token provided.' }) };
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId, username } = decoded;

        const challengeCode = generateChallengeCode();
        
        await client.query('BEGIN');

        const challengeQuery = `
            INSERT INTO challenges (creator_id, challenge_code, start_amount, time_limit_days, max_loss_percent, status)
            VALUES ($1, $2, $3, $4, $5, 'pending')
            RETURNING id, creator_id, challenge_code, start_amount, status;
        `;
        const challengeResult = await client.query(challengeQuery, [userId, challengeCode, startAmount, timeLimit, maxLossPercent]);
        const newChallenge = challengeResult.rows[0];

        const participantQuery = `
            INSERT INTO participants (challenge_id, user_id, balance)
            VALUES ($1, $2, $3);
        `;
        await client.query(participantQuery, [newChallenge.id, userId, startAmount]);

        await client.query('COMMIT');

        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'Challenge created successfully!', challenge: newChallenge }),
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create Challenge Error:', error);
        if (error.name === 'JsonWebTokenError') {
             return { statusCode: 401, body: JSON.stringify({ message: 'Invalid token.' }) };
        }
        return { statusCode: 500, body: JSON.stringify({ message: 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
