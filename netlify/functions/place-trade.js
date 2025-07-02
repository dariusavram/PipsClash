// In your project, save this file as:
// netlify/functions/place-trade.js

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
        const { challengeId, tradeType, lotSize, stopLoss, takeProfit, symbol, entryPrice } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId } = decoded;

        if (!challengeId || !tradeType || !lotSize || !symbol || !entryPrice) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing required trade parameters.' }) };
        }

        const insertTradeQuery = `
            INSERT INTO trades (participant_user_id, participant_challenge_id, symbol, type, lot_size, entry_price, stop_loss, take_profit, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
            RETURNING *;
        `;
        const tradeResult = await client.query(insertTradeQuery, [userId, challengeId, symbol, tradeType, lotSize, entryPrice, stopLoss, takeProfit]);

        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'Trade placed successfully!', trade: tradeResult.rows[0] }),
        };
    } catch (error) {
        console.error('Place Trade Error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
