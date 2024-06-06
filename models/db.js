const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.dbHost,
  user: process.env.dbUser,
  database: process.env.dbName,
  password: process.env.dbPassword
});

module.exports = pool.promise();
