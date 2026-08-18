# CMS Print Agent - Installation Guide

**Step-by-step guide for installing the Windows Print Agent on POS computers**

---

## Prerequisites Checklist

Before beginning installation, ensure:

- [ ] Windows 10/11 or Windows Server 2016+ (64-bit)
- [ ] Thermal printer physically connected (USB/Network)
- [ ] Printer driver installed from manufacturer
- [ ] Printer appears in Windows "Devices and Printers"
- [ ] Windows test page prints successfully
- [ ] Node.js 18+ installed ([download here](https://nodejs.org/))
- [ ] Administrator access to the POS computer
- [ ] CMS backend server is accessible from this computer
- [ ] Agent token obtained from CMS Owner dashboard

---

## Installation Steps

### Step 1: Verify Printer Installation

1. Open **Control Panel → Devices and Printers**
2. Locate your thermal printer (e.g., "EPSON TM-T20III")
3. Right-click → **Printer properties**
4. Click **Print Test Page**
5. ✅ Confirm test page prints successfully

**Note the exact printer name** - you'll need this later.

---

### Step 2: Register Print Agent in CMS

1. Log in to CMS as **Owner**
2. Navigate to **Settings → Print Agents**
3. Click **+ Register Agent**
4. Enter a descriptive name:
   - Examples: `Cashier Computer 1`, `POS Station A`, `Main Counter`
5. Click **Register**
6. **IMPORTANT:** Copy the 64-character token immediately
7. Save it to a secure location (you cannot retrieve it again!)

---

### Step 3: Download and Extract Print Agent

**Option A: From Release Package**
1. Download `cms-print-agent-v1.0.0.zip`
2. Extract to: `C:\CMS\print-agent\`

**Option B: From Repository**
1. Copy the `/print-agent/` folder to: `C:\CMS\print-agent\`

---

### Step 4: Install Dependencies

1. Open **PowerShell** or **Command Prompt** as **Administrator**
2. Navigate to agent directory:
   ```powershell
   cd C:\CMS\print-agent
   ```

3. Install Node.js dependencies:
   ```powershell
   npm install
   ```
   
   This will install:
   - `printer` (Windows printing library)
   - `axios` (HTTP client)
   - `socket.io-client` (Real-time communication)
   - Other required packages

4. Build the TypeScript code:
   ```powershell
   npm run build
   ```

   This creates the `dist/` folder with compiled JavaScript.

---

### Step 5: Configure Environment Variables

1. In the `C:\CMS\print-agent\` directory, copy the example config:
   ```powershell
   copy .env.example .env
   ```

2. Edit `.env` with Notepad or your preferred text editor:
   ```powershell
   notepad .env
   ```

3. Configure the following values:

   ```env
   # Backend URL (replace with your actual server address)
   CMS_API_URL=http://192.168.1.50:5000/api
   
   # Paste the token from Step 2
   AGENT_TOKEN=your_64_character_token_here
   
   # Descriptive name (same as registered in Step 2)
   AGENT_NAME=Cashier Computer 1
   
   # Stations this agent handles (comma-separated)
   STATIONS=kitchen
   
   # Log level
   LOG_LEVEL=info
   
   # Poll interval (3 seconds default)
   POLL_INTERVAL_MS=3000
   
   # Reconnection settings
   MAX_RECONNECT_ATTEMPTS=10
   RECONNECT_DELAY_MS=5000
   ```

4. **Important Configuration Notes:**
   - `CMS_API_URL`: Replace `192.168.1.50:5000` with your actual CMS backend server IP/hostname
   - `AGENT_TOKEN`: Paste the complete 64-character token (no spaces)
   - `AGENT_NAME`: Should match what you entered in CMS
   - `STATIONS`: Use `kitchen`, `bar`, or `cashier` (or multiple separated by commas)

5. Save and close the file

---

### Step 6: Test the Agent

**Run the agent manually first to verify configuration:**

```powershell
npm start
```

**Expected output:**
```
[INFO] Starting CMS Print Agent
[INFO] Windows printers discovered: EPSON TM-T20III, Microsoft Print to PDF
[INFO] Backend connection test successful
[INFO] Print agent is now running
[INFO] Starting job polling
[INFO] No pending jobs
```

**If you see errors:**

| Error | Solution |
|-------|----------|
| `CMS_API_URL is required` | Check `.env` file was created correctly |
| `Cannot connect to CMS backend` | Verify backend URL and network connectivity |
| `Agent authentication failed` | Check token is correct and not revoked |
| `Printer module not available` | Reinstall dependencies: `npm install` |

**To stop the agent:** Press `Ctrl+C`

---

### Step 7: Configure Printer in CMS

1. Log in to CMS as **Owner**
2. Navigate to **Settings → Printers**
3. Click **Add Printer** or edit existing **Kitchen** printer
4. Configure:
   - **Station:** Kitchen
   - **Transport Type:** Windows Print Agent
   - **Printer Name:** Enter exact name from Windows (e.g., `EPSON TM-T20III`)
5. Click **Save**
6. Click **Test Print** to verify
7. ✅ Check that test ticket prints

---

### Step 8: Install as Windows Service (Production)

For production use, configure the agent to start automatically with Windows.

#### Method A: Using Windows Task Scheduler (Recommended)

1. Open **Task Scheduler** (search in Start Menu)

2. Click **Create Task** (not "Create Basic Task")

3. **General Tab:**
   - Name: `CMS Print Agent`
   - Description: `Kitchen ticket printing agent for CMS POS`
   - Select: **Run whether user is logged on or not**
   - Check: **Run with highest privileges**
   - Configure for: **Windows 10**

4. **Triggers Tab:**
   - Click **New**
   - Begin the task: **At startup**
   - Delay task for: **30 seconds** (allows network to initialize)
   - Check: **Enabled**
   - Click **OK**

5. **Actions Tab:**
   - Click **New**
   - Action: **Start a program**
   - Program/script: `C:\Program Files\nodejs\node.exe`
   - Add arguments: `C:\CMS\print-agent\dist\index.js`
   - Start in: `C:\CMS\print-agent`
   - Click **OK**

6. **Conditions Tab:**
   - Uncheck: **Start the task only if the computer is on AC power**
   - Check: **Wake the computer to run this task** (optional)

7. **Settings Tab:**
   - Check: **Allow task to be run on demand**
   - Check: **Run task as soon as possible after a scheduled start is missed**
   - If the task fails, restart every: **1 minute**
   - Attempt to restart up to: **3 times**
   - Check: **If the running task does not end when requested, force it to stop**

8. Click **OK** to create the task

9. You'll be prompted for the Windows Administrator password - enter it

10. **Test the service:**
    - Right-click the task → **Run**
    - Check **Status** changes to "Running"
    - Wait 30 seconds, check if it's still running
    - Create a test order in CMS to verify printing works

#### Method B: Using NSSM (Alternative)

1. Download NSSM from [nssm.cc](https://nssm.cc/download)
2. Extract `nssm.exe` to `C:\CMS\`
3. Open PowerShell as Administrator:
   ```powershell
   cd C:\CMS
   .\nssm install CMSPrintAgent
   ```

4. In the NSSM Service Installer window:
   - **Path:** `C:\Program Files\nodejs\node.exe`
   - **Startup directory:** `C:\CMS\print-agent`
   - **Arguments:** `dist\index.js`
   - **Service name:** `CMSPrintAgent`

5. Click **Install service**

6. Start the service:
   ```powershell
   .\nssm start CMSPrintAgent
   ```

7. Verify it's running:
   ```powershell
   .\nssm status CMSPrintAgent
   ```

---

### Step 9: Verify Installation

1. **Check Agent Status in CMS:**
   - Log in as Owner
   - Go to Settings → Print Agents
   - Find your agent
   - Verify status shows **Online** (green badge)
   - Check "Last active" is recent (< 30 seconds ago)

2. **Test Kitchen Printing:**
   - Create a test order in CMS
   - Verify kitchen ticket prints automatically
   - Check ticket contains:
     - Order number
     - Table number
     - Items with quantities
     - Timestamps
     - Notes (if any)

3. **Restart Computer Test:**
   - Restart the POS computer
   - Wait 2-3 minutes after boot
   - Check agent appears Online in CMS
   - Create another test order to verify printing

---

## Post-Installation

### Monitoring

- **Agent Status:** Check CMS → Print Agents for online/offline status
- **Last Heartbeat:** Updates every 3 seconds when agent polls for jobs
- **Print Job History:** Check individual orders for print status

### Logging

**View logs in real-time:**
```powershell
# If running manually
npm start

# If running as Task Scheduler task
# Modify the task to redirect output:
# Arguments: dist\index.js >> C:\CMS\print-agent\agent.log 2>&1
```

**Log location (if redirected):**
- `C:\CMS\print-agent\agent.log`

**Log levels:**
- `debug`: Verbose (every job check, every heartbeat)
- `info`: Normal operations (jobs processed, connections)
- `warn`: Warnings (printer offline, connection issues)
- `error`: Errors (authentication failed, critical failures)

### Troubleshooting

**Agent shows Offline:**
- Check Task Scheduler task is Running
- Verify backend URL is accessible from POS computer
- Check firewall isn't blocking outbound connections
- Restart the task or service

**Prints not appearing:**
- Verify printer is powered on
- Check printer has paper
- Print a Windows test page to verify driver works
- Check printer name in CMS matches Windows exactly (case-sensitive)
- Review agent logs for errors

**"Printer not available" errors:**
- Printer may be offline or paused in Windows
- Open Devices and Printers, right-click printer → "See what's printing"
- Check for errors or paused status
- Restart the Windows Print Spooler service:
  ```powershell
  net stop spooler
  net start spooler
  ```

---

## Uninstallation

1. **Remove Windows Service/Task:**
   - **Task Scheduler:** Delete the "CMS Print Agent" task
   - **NSSM:** `nssm remove CMSPrintAgent confirm`

2. **Revoke Agent in CMS:**
   - Log in as Owner
   - Settings → Print Agents
   - Click revoke button next to the agent

3. **Remove Files:**
   ```powershell
   rmdir /s C:\CMS\print-agent
   ```

---

## Security Best Practices

1. **Token Security:**
   - Never commit `.env` to version control
   - Don't share tokens via email or chat
   - Rotate tokens if compromised (revoke old, register new)

2. **File Permissions:**
   - Restrict `.env` file to Administrators only:
     ```powershell
     icacls C:\CMS\print-agent\.env /inheritance:r /grant:r "Administrators:(F)"
     ```

3. **Network Security:**
   - Use HTTPS for CMS_API_URL in production
   - Configure Windows Firewall to allow outbound HTTPS only
   - Consider VPN for remote POS locations

4. **Updates:**
   - Keep Node.js updated
   - Update print agent when new versions are released
   - Test updates on one POS before deploying to all

---

## Multi-Station Setup

If you have multiple POS computers:

1. **Install on each computer** following this guide
2. **Register a unique agent** for each computer in CMS
   - Examples: "Cashier 1", "Cashier 2", "Bar Station"
3. **Use unique agent tokens** - never reuse tokens
4. **Configure stations appropriately:**
   - Front counter POS: `STATIONS=kitchen,cashier`
   - Bar POS: `STATIONS=bar`
   - Kitchen display: `STATIONS=kitchen`

Agents with overlapping stations will share the workload automatically through job claiming.

---

## Support

**For issues:**
1. Check agent logs for error messages
2. Review this troubleshooting section
3. Verify all prerequisites are met
4. Test with Windows test page first
5. Contact your system administrator

**Agent Version:** 1.0.0  
**Last Updated:** 2024
