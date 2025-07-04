// In your project, save this file as:
// netlify/
//   functions/
//     get-challenges.js

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

exports.handler = async (event, context) => {
    // This endpoint is public, so it only accepts GET requests and requires no authentication.
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const client = await pool.connect();
    try {
        // This query fetches all challenges marked as public.
        // It joins with the users table to get the creator's username.
        // It also uses a subquery to aggregate all participant usernames for each challenge.
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
            WHERE c.is_public = TRUE
            ORDER BY c.created_at DESC;
        `;
        const result = await client.query(query);
        
        return {
            statusCode: 200,
            body: JSON.stringify(result.rows),
        };
    } catch (error) {
        console.error('Get Public Challenges Error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'An internal server error occurred.' }) };
    } finally {
        client.release();
    }
};
