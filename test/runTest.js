const bcrypt = require('bcryptjs');
const db = require('/Users/darksoul/Desktop/POSMerchant/backend/utils/db');
const auditEmitter = require('/Users/darksoul/Desktop/POSMerchant/backend/utils/auditEmitter');

// Start the server programmatically
process.env.PORT = 5099; // Use a different port to avoid conflicts
process.env.JWT_ACCESS_SECRET = 'test_secret_key_9876543210';
process.env.JWT_ACCESS_EXPIRY = '5m';
process.env.JWT_REFRESH_EXPIRY_DAYS = '30';

// Import index.js to boot server
require('/Users/darksoul/Desktop/POSMerchant/backend/index');

const BASE_URL = 'http://127.0.0.1:5099';

// Setup test helpers
async function cleanDatabase() {
    console.log('Cleaning up test tables...');
    await db.query('DELETE FROM refresh_tokens');
    await db.query('DELETE FROM login_audit');
    await db.query('DELETE FROM employees');
    await db.query('DELETE FROM branches');
}

async function runTests() {
    let testBranchId1;
    let testBranchId2;
    let superAdminId;
    let superAdminToken;
    let managerId;
    let managerToken;
    let operatorId;
    let engineerId;
    let engineerToken;

    try {
        await cleanDatabase();

        // 1. Create test branches
        console.log('Inserting test branches...');
        const [branchResult1] = await db.query(
            `INSERT INTO branches (branch_code, branch_name, address) VALUES (?, ?, ?)`,
            ['BR-TEST-01', 'Test Branch 01', '123 Test St']
        );
        // Find branch 1 ID
        const [branch1Rows] = await db.query('SELECT id FROM branches WHERE branch_code = ?', ['BR-TEST-01']);
        testBranchId1 = branch1Rows[0].id;

        const [branchResult2] = await db.query(
            `INSERT INTO branches (branch_code, branch_name, address) VALUES (?, ?, ?)`,
            ['BR-TEST-02', 'Test Branch 02', '456 Test Ave']
        );
        const [branch2Rows] = await db.query('SELECT id FROM branches WHERE branch_code = ?', ['BR-TEST-02']);
        testBranchId2 = branch2Rows[0].id;

        console.log(`Branch 1: ${testBranchId1}, Branch 2: ${testBranchId2}`);

        // 2. Seed a SUPERADMIN directly into employees
        console.log('Seeding SUPERADMIN...');
        const superPassHash = await bcrypt.hash('Admin@123', 12);
        await db.query(
            `INSERT INTO employees (full_name, mobile, email, password_hash, role, branch_id) VALUES (?, ?, ?, ?, ?, ?)`,
            ['Root Admin', '9999999999', 'admin@pos.com', superPassHash, 'SUPERADMIN', testBranchId1]
        );
        const [adminRows] = await db.query('SELECT id FROM employees WHERE mobile = ?', ['9999999999']);
        superAdminId = adminRows[0].id;
        console.log(`SUPERADMIN ID: ${superAdminId}`);

        // Wait for server to be fully ready
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Test: LOGIN
        console.log('\n--- TESTING LOGIN ---');

        // 3a. Successful login
        const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'admin@pos.com', password: 'Admin@123' })
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok || !loginData.success) {
            throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
        }
        superAdminToken = loginData.data.accessToken;
        const superAdminRefreshToken = loginData.data.refreshToken;
        console.log('✅ Successful login verified');

        // 3b. Invalid credentials (password)
        const loginFailRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'admin@pos.com', password: 'WrongPassword' })
        });
        const loginFailData = await loginFailRes.json();
        if (loginFailRes.status !== 401 || loginFailData.success) {
            throw new Error(`Expected 401 on wrong password, got: ${loginFailRes.status}`);
        }
        console.log('✅ Invalid password login returns 401');

        // 3c. Invalid credentials (non-existent email)
        const loginNoUserRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'nonexistent@pos.com', password: 'Admin@123' })
        });
        if (loginNoUserRes.status !== 401) {
            throw new Error(`Expected 401 on non-existent identifier, got: ${loginNoUserRes.status}`);
        }
        console.log('✅ Non-existent user login returns 401');

        // 4. Test: REGISTER (SUPERADMIN registers MANAGER in Branch 1)
        console.log('\n--- TESTING REGISTRATION ---');

        const regManagerRes = await fetch(`${BASE_URL}/api/employees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${superAdminToken}`
            },
            body: JSON.stringify({
                full_name: 'Branch Manager',
                mobile: '8888888888',
                email: 'manager@pos.com',
                password: 'Manager@123',
                role: 'MANAGER',
                branch_id: testBranchId1
            })
        });
        const regManagerData = await regManagerRes.json();
        if (!regManagerRes.ok || !regManagerData.success) {
            throw new Error(`Manager registration failed: ${JSON.stringify(regManagerData)}`);
        }
        managerId = regManagerData.data.id;
        console.log(`✅ Super Admin registered Manager successfully: ${managerId}`);

        // Login as Manager to get token
        const managerLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'manager@pos.com', password: 'Manager@123' })
        });
        const managerLoginData = await managerLoginRes.json();
        managerToken = managerLoginData.data.accessToken;

        // 4b. MANAGER registers OPERATOR in Branch 1 (subordinate, allowed)
        const regOperatorRes = await fetch(`${BASE_URL}/api/employees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                full_name: 'Branch Operator',
                mobile: '7777777777',
                email: 'operator@pos.com',
                password: 'Operator@123',
                role: 'OPERATOR',
                branch_id: testBranchId1
            })
        });
        const regOperatorData = await regOperatorRes.json();
        if (!regOperatorRes.ok || !regOperatorData.success) {
            throw new Error(`Operator registration failed: ${JSON.stringify(regOperatorData)}`);
        }
        operatorId = regOperatorData.data.id;
        console.log(`✅ Manager registered Operator subordinate successfully: ${operatorId}`);

        // 4c. MANAGER registers ENGINEER in Branch 1 (subordinate, allowed)
        const regEngineerRes = await fetch(`${BASE_URL}/api/employees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                full_name: 'Branch Engineer',
                mobile: '6666666666',
                email: 'engineer@pos.com',
                password: 'Engineer@123',
                role: 'ENGINEER',
                branch_id: testBranchId1
            })
        });
        const regEngineerData = await regEngineerRes.json();
        if (!regEngineerRes.ok || !regEngineerData.success) {
            throw new Error(`Engineer registration failed: ${JSON.stringify(regEngineerData)}`);
        }
        engineerId = regEngineerData.data.id;
        console.log(`✅ Manager registered Engineer subordinate successfully: ${engineerId}`);

        // 4d. MANAGER tries to register someone in Branch 2 (cross-branch registration, forbidden)
        const regCrossBranchRes = await fetch(`${BASE_URL}/api/employees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                full_name: 'Cross Branch Eng',
                mobile: '5555555555',
                email: 'cross@pos.com',
                password: 'Engineer@123',
                role: 'ENGINEER',
                branch_id: testBranchId2
            })
        });
        if (regCrossBranchRes.status !== 403) {
            throw new Error(`Expected 403 on Manager cross-branch registration, got: ${regCrossBranchRes.status}`);
        }
        console.log('✅ Manager cross-branch registration blocked (403)');

        // 4e. MANAGER tries to register another MANAGER (role escalation, forbidden)
        const regEscalatedRes = await fetch(`${BASE_URL}/api/employees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                full_name: 'Escalated Manager',
                mobile: '5555555555',
                email: 'escap@pos.com',
                password: 'Manager@123',
                role: 'MANAGER',
                branch_id: testBranchId1
            })
        });
        if (regEscalatedRes.status !== 403) {
            throw new Error(`Expected 403 on Manager trying to register Manager, got: ${regEscalatedRes.status}`);
        }
        console.log('✅ Manager registering Manager blocked (403)');

        // 4f. ENGINEER tries to register someone (unauthorized role, forbidden)
        // Login as Engineer first
        const engLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'engineer@pos.com', password: 'Engineer@123' })
        });
        const engLoginData = await engLoginRes.json();
        engineerToken = engLoginData.data.accessToken;

        const regByEngRes = await fetch(`${BASE_URL}/api/employees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${engineerToken}`
            },
            body: JSON.stringify({
                full_name: 'Engineer Rogue Reg',
                mobile: '4444444444',
                email: 'rogue@pos.com',
                password: 'Engineer@123',
                role: 'ENGINEER',
                branch_id: testBranchId1
            })
        });
        if (regByEngRes.status !== 403) {
            throw new Error(`Expected 403 on Engineer trying to register, got: ${regByEngRes.status}`);
        }
        console.log('✅ Engineer registering employee blocked (403)');

        // 5. Test: LIST EMPLOYEES
        console.log('\n--- TESTING LIST ---');

        // 5a. Super admin list all
        const listSuperRes = await fetch(`${BASE_URL}/api/employees`, {
            headers: { 'Authorization': `Bearer ${superAdminToken}` }
        });
        const listSuperData = await listSuperRes.json();
        if (!listSuperRes.ok || listSuperData.employees.length < 4) {
            throw new Error(`Super admin list failed: ${JSON.stringify(listSuperData)}`);
        }
        console.log(`✅ Super Admin listed all successfully (found ${listSuperData.employees.length} employees)`);

        // 5b. Manager lists subordinates
        const listManagerRes = await fetch(`${BASE_URL}/api/employees`, {
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });
        const listManagerData = await listManagerRes.json();
        if (!listManagerRes.ok) {
            throw new Error(`Manager list failed: ${JSON.stringify(listManagerData)}`);
        }
        // Verify manager doesn't see Super Admin or self, only Operator and Engineer
        const visibleRoles = listManagerData.employees.map(e => e.role);
        if (visibleRoles.includes('SUPERADMIN') || visibleRoles.includes('MANAGER')) {
            throw new Error(`Manager list contains invalid roles: ${JSON.stringify(visibleRoles)}`);
        }
        console.log(`✅ Manager lists only subordinates in own branch (found roles: ${JSON.stringify(visibleRoles)})`);

        // 6. Test: GET ONE
        console.log('\n--- TESTING GET ONE ---');

        // 6a. Engineer gets self (allowed)
        const getSelfRes = await fetch(`${BASE_URL}/api/employees/${engineerId}`, {
            headers: { 'Authorization': `Bearer ${engineerToken}` }
        });
        const getSelfData = await getSelfRes.json();
        if (!getSelfRes.ok || getSelfData.data.id !== engineerId) {
            throw new Error(`Engineer get self failed: ${JSON.stringify(getSelfData)}`);
        }
        console.log('✅ Engineer can fetch own profile');

        // 6b. Engineer gets Manager (forbidden)
        const getOtherRes = await fetch(`${BASE_URL}/api/employees/${managerId}`, {
            headers: { 'Authorization': `Bearer ${engineerToken}` }
        });
        if (getOtherRes.status !== 403) {
            throw new Error(`Expected 403 on Engineer fetching Manager, got: ${getOtherRes.status}`);
        }
        console.log('✅ Engineer fetching other profile blocked (403)');

        // 7. Test: EDIT
        console.log('\n--- TESTING EDIT ---');

        // 7a. Engineer edits self (allowed fields: full_name, mobile, email)
        const editSelfRes = await fetch(`${BASE_URL}/api/employees/${engineerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${engineerToken}`
            },
            body: JSON.stringify({
                full_name: 'Branch Engineer Edited',
                mobile: '6666666660'
            })
        });
        const editSelfData = await editSelfRes.json();
        if (!editSelfRes.ok || editSelfData.data.full_name !== 'Branch Engineer Edited') {
            throw new Error(`Engineer edit self failed: ${JSON.stringify(editSelfData)}`);
        }
        console.log('✅ Engineer can edit own profile allowed fields');

        // 7b. Engineer tries to edit base_salary (ignored field for Engineer)
        const editSelfSalRes = await fetch(`${BASE_URL}/api/employees/${engineerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${engineerToken}`
            },
            body: JSON.stringify({
                base_salary: 99999.00
            })
        });
        const editSelfSalData = await editSelfSalRes.json();
        // Since base_salary is ignored, target.base_salary in DB should remain NULL
        const dbTarget = await db.query('SELECT base_salary FROM employees WHERE id = ?', [engineerId]);
        if (dbTarget[0][0].base_salary !== null) {
            throw new Error(`Engineer base_salary update was not ignored! Got: ${dbTarget[0][0].base_salary}`);
        }
        console.log('✅ Forbidden fields are silently ignored on self-update');

        // 7c. Manager edits Engineer subordinate (allowed fields: full_name, mobile, base_salary, status)
        const editSubRes = await fetch(`${BASE_URL}/api/employees/${engineerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                full_name: 'Engineer ManagerEdited',
                base_salary: 5000.00
            })
        });
        const editSubData = await editSubRes.json();
        if (!editSubRes.ok || editSubData.data.full_name !== 'Engineer ManagerEdited' || parseFloat(editSubData.data.base_salary) !== 5000.00) {
            throw new Error(`Manager edit subordinate failed: ${JSON.stringify(editSubData)}`);
        }
        console.log('✅ Manager can edit subordinate allowed fields (salary/name)');

        // 7d. Manager tries to edit Engineer subordinate role to MANAGER (role escalation, forbidden)
        const editSubEscalRes = await fetch(`${BASE_URL}/api/employees/${engineerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                role: 'MANAGER'
            })
        });
        // role editing should be silently ignored for Manager. Let's check DB role remains ENGINEER
        const dbTargetRole = await db.query('SELECT role FROM employees WHERE id = ?', [engineerId]);
        if (dbTargetRole[0][0].role !== 'ENGINEER') {
            throw new Error(`Manager role escalation was not ignored! Role updated to: ${dbTargetRole[0][0].role}`);
        }
        console.log('✅ Manager trying to edit subordinate role to MANAGER was ignored');

        // 7e. Super Admin edits Manager role/branch (allowed)
        const editManagerRes = await fetch(`${BASE_URL}/api/employees/${managerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${superAdminToken}`
            },
            body: JSON.stringify({
                branch_id: testBranchId2
            })
        });
        const editManagerData = await editManagerRes.json();
        if (!editManagerRes.ok || editManagerData.data.branch_id !== testBranchId2) {
            throw new Error(`Super Admin edit manager failed: ${JSON.stringify(editManagerData)}`);
        }
        console.log('✅ Super Admin can edit branch_id of managers');

        // Restore manager's branch for subsequent tests
        await db.query('UPDATE employees SET branch_id = ? WHERE id = ?', [testBranchId1, managerId]);

        // 7f. Super Admin tries to edit their own status to INACTIVE (forbidden self-lockout)
        const editAdminStatusRes = await fetch(`${BASE_URL}/api/employees/${superAdminId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${superAdminToken}`
            },
            body: JSON.stringify({
                status: 'INACTIVE'
            })
        });
        if (editAdminStatusRes.status !== 403) {
            throw new Error(`Expected 403 on Super Admin inactivating self, got: ${editAdminStatusRes.status}`);
        }
        console.log('✅ Super Admin self status lockout prevented (403)');

        // 8. Test: REFRESH TOKEN ROTATION
        console.log('\n--- TESTING REFRESH TOKEN ROTATION ---');

        const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: superAdminRefreshToken, employeeId: superAdminId })
        });
        const refreshData = await refreshRes.json();
        if (!refreshRes.ok || !refreshData.success) {
            throw new Error(`Refresh failed: ${JSON.stringify(refreshData)}`);
        }
        const newSuperAdminToken = refreshData.data.accessToken;
        const newSuperAdminRefreshToken = refreshData.data.refreshToken;
        console.log('✅ Token refresh rotation successful');

        // Verify old refresh token is revoked
        const oldHash = require('crypto').createHash('sha256').update(superAdminRefreshToken).digest('hex');
        const oldTokenCheck = await db.query('SELECT revoked FROM refresh_tokens WHERE token_hash = ?', [oldHash]);
        if (oldTokenCheck[0][0].revoked !== 1) {
            throw new Error('Old refresh token was not revoked after rotation!');
        }
        console.log('✅ Hashed old refresh token is confirmed revoked');

        // 9. Test: DELETE / DEACTIVATION
        console.log('\n--- TESTING DEACTIVATION ---');

        // 9a. Manager deactivates Engineer (allowed)
        const deleteRes = await fetch(`${BASE_URL}/api/employees/${engineerId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });
        const deleteData = await deleteRes.json();
        if (!deleteRes.ok || !deleteData.success) {
            throw new Error(`Deactivation failed: ${JSON.stringify(deleteData)}`);
        }
        console.log('✅ Subordinate deactivation successful');

        // Verify status is INACTIVE and refresh tokens are revoked
        const dbDeleted = await db.query('SELECT status FROM employees WHERE id = ?', [engineerId]);
        if (dbDeleted[0][0].status !== 'INACTIVE') {
            throw new Error(`Employee status was not set to INACTIVE! Got: ${dbDeleted[0][0].status}`);
        }
        console.log('✅ Soft-deleted employee status is confirmed INACTIVE');

        const deletedTokens = await db.query('SELECT revoked FROM refresh_tokens WHERE employee_id = ?', [engineerId]);
        const allRevoked = deletedTokens[0].every(t => t.revoked === 1);
        if (!allRevoked) {
            throw new Error('Tokens were not revoked on deactivation!');
        }
        console.log('✅ Deactivated employee refresh tokens are confirmed revoked');

        // 9b. Attempt login as deactivated employee (should return 403)
        const loginDeactRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'engineer@pos.com', password: 'Engineer@123' })
        });
        const loginDeactData = await loginDeactRes.json();
        if (loginDeactRes.status !== 403 || loginDeactData.message !== 'Account is inactive') {
            throw new Error(`Expected 403 "Account is inactive" on inactive login, got: ${loginDeactRes.status} ${JSON.stringify(loginDeactData)}`);
        }
        console.log('✅ Login as deactivated employee is blocked with 403 Account is inactive');

        // 9c. Manager tries to delete self (forbidden)
        const deleteSelfRes = await fetch(`${BASE_URL}/api/employees/${managerId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });
        if (deleteSelfRes.status !== 403) {
            throw new Error(`Expected 403 on Manager deleting self, got: ${deleteSelfRes.status}`);
        }
        console.log('✅ Manager self deletion blocked (403)');

        // 10. Test: LOGOUT
        console.log('\n--- TESTING LOGOUT ---');

        const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${newSuperAdminToken}`
            },
            body: JSON.stringify({ refreshToken: newSuperAdminRefreshToken })
        });
        const logoutData = await logoutRes.json();
        if (!logoutRes.ok || !logoutData.success) {
            throw new Error(`Logout failed: ${JSON.stringify(logoutData)}`);
        }
        console.log('✅ Logout successful');

        // Verify token is revoked
        const logoutHash = require('crypto').createHash('sha256').update(newSuperAdminRefreshToken).digest('hex');
        const logoutTokenCheck = await db.query('SELECT revoked FROM refresh_tokens WHERE token_hash = ?', [logoutHash]);
        if (logoutTokenCheck[0][0].revoked !== 1) {
            throw new Error('Refresh token was not revoked after logout!');
        }
        console.log('✅ Logout token is confirmed revoked in DB');

        console.log('\n======================================');
        console.log('🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY 🎉');
        console.log('======================================');

        await cleanDatabase();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ VERIFICATION TEST FAILED:');
        console.error(error);
        await cleanDatabase();
        process.exit(1);
    }
}

// Run test script after server binds
setTimeout(() => {
    runTests().catch(err => {
        console.error(err);
        process.exit(1);
    });
}, 1000);