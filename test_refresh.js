require('dotenv').config();
const jwt = require('jsonwebtoken');

const oldToken = jwt.sign({ id: '123', name: 'Test' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '1m' });
const newToken = jwt.sign({ id: '123', name: 'Test', login_time: new Date().toISOString() }, process.env.JWT_ACCESS_SECRET, { expiresIn: '1m' });

console.log("Old Token: " + oldToken);
console.log("New Token: " + newToken);
console.log("Are they same? " + (oldToken === newToken));
