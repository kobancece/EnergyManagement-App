// models/db.js
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  database: 'EnergyManagement',
  password: 'energy.1234'
});

module.exports = pool.promise();
