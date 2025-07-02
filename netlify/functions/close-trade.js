// In your project, save this file as:
// netlify/functions/close-trade.js

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
        const { challengeId, tradeId, closePrice } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId } = decoded;

        await client.query('BEGIN');

        // Get the trade to ensure it belongs to the user and is open
        const tradeQuery = "SELECT * FROM trades WHERE id = $1 AND participant_user_id = $2 AND status = 'open'";
        const tradeResult = await client.query(tradeQuery, [tradeId, userId]);

        if (tradeResult.rows.length === 0) {
            throw new Error('Trade not found or already closed.');
        }
        const trade = tradeResult.rows[0];

        // Calculate P/L
        const contractSize = 100000;
        let pnl = 0;
        if (trade.type === 'buy') {
            pnl = (closePrice - trade.entry_price) * trade.lot_size * contractSize;
        } else {
            pnl = (trade.entry_price - closePrice) * trade.lot_size * contractSize;
        }

        // Update participant's balance
        const updateBalanceQuery = `
            UPDATE participants SET balance = balance + $1 WHERE user_id = $2 AND challenge_id = $3
        `;
        await client.query(updateBalanceQuery, [pnl, userId, challengeId]);

        // Mark trade as closed
        const updateTradeQuery = "UPDATE trades SET status = 'closed', close_price = $1, closed_at = NOW() WHERE id = $2";
        await client.query(updateTradeQuery, [closePrice, tradeId]);

        await client.query('COMMIT');

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Trade closed! P/L: ${pnl.toFixed(2)}` }),
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Close Trade Error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: error.message || 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
