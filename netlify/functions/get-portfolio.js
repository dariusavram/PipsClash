// In your project, save this file as:
// netlify/functions/get-portfolio.js

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
        
        const { challengeId } = event.queryStringParameters;
        if (!challengeId) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Challenge ID is required.' }) };
        }

        // Get participant's balance
        const balanceQuery = 'SELECT balance FROM participants WHERE user_id = $1 AND challenge_id = $2';
        const balanceResult = await client.query(balanceQuery, [userId, challengeId]);
        
        if (balanceResult.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ message: 'You are not a participant in this challenge.' }) };
        }
        const balance = balanceResult.rows[0].balance;

        // Get all open trades for the participant in this challenge
        const tradesQuery = "SELECT * FROM trades WHERE participant_user_id = $1 AND participant_challenge_id = $2 AND status = 'open' ORDER BY opened_at DESC";
        const tradesResult = await client.query(tradesQuery, [userId, challengeId]);

        return {
            statusCode: 200,
            body: JSON.stringify({
                balance: balance,
                trades: tradesResult.rows
            }),
        };
    } catch (error) {
        console.error('Get Portfolio Error:', error);
        if (error.name === 'JsonWebTokenError') {
             return { statusCode: 401, body: JSON.stringify({ message: 'Invalid token.' }) };
        }
        return { statusCode: 500, body: JSON.stringify({ message: 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
