async function test() {
  try {
    const login = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'manager', 
        password: 'password123'
      })
    });
    const loginData = await login.json();
    
    const token = loginData.token;
    
    // Find a waiter
    const waitersRes = await fetch('http://localhost:5001/api/users?role=WAITER', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const waiters = await waitersRes.json();
    const waiter = waiters.find(u => u.role === 'WAITER') || waiters[0];

    // Get a menu item
    const itemsRes = await fetch('http://localhost:5001/api/menu', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const itemsData = await itemsRes.json();
    const item = itemsData.data ? itemsData.data[0] : itemsData[0];

    // Create order
    const orderRes = await fetch('http://localhost:5001/api/orders', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({
        clientOrderId: "test-" + Date.now(),
        tableNumber: "T1",
        waiterId: waiter.id,
        items: [{ menuItemId: item.id, quantity: 1 }]
      })
    });
    const orderData = await orderRes.json();

    console.log("Order created!");
    console.log("Waiter:", orderData.order.waiter);
    console.log("Cashier:", orderData.order.cashier);
  } catch(e) {
    console.error(e);
  }
}
test();
