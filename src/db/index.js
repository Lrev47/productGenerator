const { Pool } = require("pg");
const { dbConnectionString } = require("../config");

const pool = new Pool({
  connectionString: dbConnectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

module.exports = {
  query,
};
