// In your project, save this file as:
// netlify/functions/update-trade-sl-tp.js

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
const JWT_SECRET = process.env.JWT_SECRET;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const client = await pool.connect();
    try {
        const { challengeId, tradeId, stopLoss, takeProfit } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId } = decoded;

        const query = `
            UPDATE trades 
            SET stop_loss = $1, take_profit = $2 
            WHERE id = $3 AND participant_user_id = $4 AND participant_challenge_id = $5;
        `;
        await client.query(query, [stopLoss, takeProfit, tradeId, userId, challengeId]);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Trade updated successfully!' }),
        };
    } catch (error) {
        console.error('Update Trade Error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
