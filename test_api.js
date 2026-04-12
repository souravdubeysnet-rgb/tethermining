fetch('http://localhost:3000/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        first_name: "Test",
        last_name: "User",
        email: "test" + Date.now() + "@gmail.com",
        mobile: "1234567890",
        password: "StrongPass123!"
    })
}).then(res => res.json()).then(console.log).catch(console.error);
