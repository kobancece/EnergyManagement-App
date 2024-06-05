const request = require('supertest');
const app = require('../app');
const db = require('../models/db');
const speakeasy = require('speakeasy');

beforeAll(async () => {
  // Set up any required initial data or state here
  await db.execute('DELETE FROM users WHERE email = ?', ['testuser@example.com']);
});

afterAll(async () => {
  // Clean up any data or state here
  await db.execute('DELETE FROM users WHERE email = ?', ['testuser@example.com']);
  db.end();
});

describe('Energy Management System Tests', () => {
    beforeAll(async () => {
        // Clean up and set up test database before running tests
        await db.execute('DELETE FROM users WHERE email = ?', ['testuser@example.com']);
    });

    afterAll(async () => {
        // Clean up test database after running tests
        await db.execute('DELETE FROM users WHERE email = ?', ['testuser@example.com']);
    });

    // Test for user registration
    test('should register a new user', async () => {
        const res = await request(app)
            .post('/energymanagement/register')
            .send({
                email: 'testuser@example.com',
                username: 'testuser',
                password: 'testpassword',
                firstName: 'Test',
                lastName: 'User',
                phoneNumber: '1234567890',
                address: 'Test Address'
            });
        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('message', 'User registered successfully');
        expect(res.body).toHaveProperty('userId');
    });

    // Test for user login with valid credentials
    test('should log in an existing user', async () => {
        const res = await request(app)
            .post('/energymanagement/login')
            .send({
                email: 'testuser@example.com',
                password: 'testpassword'
            });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('userId');
    });

    // Test for user login with invalid credentials
    test('should fail to log in with invalid credentials', async () => {
        const res = await request(app)
            .post('/energymanagement/login')
            .send({
                email: 'testuser@example.com',
                password: 'wrongpassword'
            });
        expect(res.statusCode).toBe(401);
        expect(res.body).toHaveProperty('message', 'Invalid password');
    });

    // Test for fetching wash sessions
    test('should fetch user wash sessions after login', async () => {
        const agent = request.agent(app);

        // First, log in
        let res = await agent
            .post('/energymanagement/login')
            .send({
                email: 'testuser@example.com',
                password: 'testpassword'
            });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('userId');

        // Then, fetch wash sessions
        res = await agent.get('/energymanagement/washsessions');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    // Test for fetching usage tips
    test('should fetch user tips after login', async () => {
        const agent = request.agent(app);

        // First, log in
        let res = await agent
            .post('/energymanagement/login')
            .send({
                email: 'testuser@example.com',
                password: 'testpassword'
            });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('userId');

        // Then, fetch usage tips
        res = await agent.get('/energymanagement/tips');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    // Test for enabling 2FA
    test('should enable 2FA for a user', async () => {
        const res = await request(app)
            .post('/twofa/enable-2fa')
            .send({
                userId: 1 // Use a valid user ID
            });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('secret');
        expect(res.body).toHaveProperty('qrCode');
    });

    // Test for verifying 2FA
    test('should verify 2FA for a user', async () => {
        // First, enable 2FA to get the secret
        let res = await request(app)
            .post('/twofa/enable-2fa')
            .send({
                userId: 1 // Use a valid user ID
            });
        expect(res.statusCode).toBe(200);
        const { secret } = res.body;

        // Then, generate a valid token
        const token = speakeasy.totp({
            secret,
            encoding: 'base32'
        });

        // Verify the 2FA token
        res = await request(app)
            .post('/twofa/verify-2fa')
            .send({
                userId: 1,
                token
            });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('message', '2FA verified successfully');
    });

    // Test for fetching monthly consumption
    test('should fetch monthly consumption data', async () => {
        const agent = request.agent(app);

        // First, log in
        let res = await agent
            .post('/energymanagement/login')
            .send({
                email: 'testuser@example.com',
                password: 'testpassword'
            });
        expect(res.statusCode).toBe(200);

        // Then, fetch monthly consumption data
        res = await agent.get('/energymanagement/monthly-consumption');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    // Test for fetching yearly consumption
    test('should fetch yearly consumption data', async () => {
        const agent = request.agent(app);

        // First, log in
        let res = await agent
            .post('/energymanagement/login')
            .send({
                email: 'testuser@example.com',
                password: 'testpassword'
            });
        expect(res.statusCode).toBe(200);

        // Then, fetch yearly consumption data
        res = await agent.get('/energymanagement/yearly-consumption');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    // Test for fetching monthly cost
    test('should fetch monthly cost data', async () => {
        const agent = request.agent(app);

        // First, log in
        let res = await agent
            .post('/energymanagement/login')
            .send({
                email: 'testuser@example.com',
                password: 'testpassword'
            });
        expect(res.statusCode).toBe(200);

        // Then, fetch monthly cost data
        res = await agent.get('/energymanagement/monthly-cost');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    // Test for fetching yearly cost
    test('should fetch yearly cost data', async () => {
        const agent = request.agent(app);

        // First, log in
        let res = await agent
            .post('/energymanagement/login')
            .send({
                email: 'testuser@example.com',
                password: 'testpassword'
            });
        expect(res.statusCode).toBe(200);

        // Then, fetch yearly cost data
        res = await agent.get('/energymanagement/yearly-cost');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});

