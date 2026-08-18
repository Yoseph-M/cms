# CMS Windows Print Agent

**Production-quality Windows Print Agent for CMS POS kitchen ticket printing.**

This agent runs on Windows POS/cashier computers and handles automatic printing of kitchen order tickets through the Windows print spooler, preserving ESC/POS thermal printer commands.

---

## Architecture

```
CMS Backend
    ↓
  PrintJob (MongoDB)
    ↓
Windows Print Agent (This Application)
    ↓
Windows Print Spooler
    ↓
  Printer Driver
    ↓
Physical Kitchen Printer
```

---

## Features

- ✅ **RAW ESC/POS Printing** - Preserves thermal printer commands
- ✅ **Automatic Job Claiming** - Prevents duplicate printing across multiple agents
- ✅ **Idempotent Operations** - Safe restarts and reconnections
- ✅ **Durable Print Jobs** - Survives agent restarts
- ✅ **Automatic Reconnection** - Recovers from network failures
- ✅ **Printer Discovery** - Lists all Windows-installed printers
- ✅ **Multi-Station Support** - Kitchen, Bar, Cashier stations
- ✅ **Secure Authentication** - Token-based agent authentication
- ✅ **Comprehensive Logging** - Detailed operational logs

---

## Prerequisites

### 1. Windows Operating System
This agent **must run on Windows** (7, 10, 11, Server 2016+).

### 2. Printer Driver Installed
Install your thermal printer's Windows driver **before** installing the agent.

**Example:**
- EPSON TM-T20III → Install EPSON driver from manufacturer
- XPrinter XP-Q200 → Install XPrinter driver
- Generic POS-58 → Install appropriate USB/Serial driver

**Verify:** Open **Control Panel → Devices and Printers** and confirm your printer appears.

### 3. Node.js Installed
Download and install **Node.js 18+** from [nodejs.org](https://nodejs.org/)

---

## Installation

### Step 1: Install Printer Driver
1. Connect your thermal printer (USB or Network)
2. Install manufacturer's Windows driver
3. Verify printer appears in **Control Panel → Devices and Printers**
4. Print a Windows test page to confirm functionality

### Step 2: Register Print Agent in CMS
1. Log in to CMS as **Owner**
2. Navigate to **Settings → Print Agents**
3. Click **Register Agent**
4. Enter agent name (e.g., "Cashier Computer 1")
5. **Copy the generated token** (you cannot retrieve it again!)

### Step 3: Install Print Agent Software
1. Extract this folder to a permanent location:
   ```
   C:\CMS\print-agent\
   ```

2. Open PowerShell or Command Prompt **as Administrator**

3. Navigate to the agent directory:
   ```cmd
   cd C:\CMS\print-agent
   ```

4. Install dependencies:
   ```cmd
   npm install
   ```

5. Build the agent:
   ```cmd
   npm run build
   ```

### Step 4: Configure Agent
1. Copy `.env.example` to `.env`:
   ```cmd
   copy .env.example .env
   ```

2. Edit `.env` with a text editor (Notepad, VS Code):
   ```env
   CMS_API_URL=http://192.168.1.50:5000/api
   AGENT_TOKEN=your-64-character-token-from-step-2
   AGENT_NAME=Cashier Computer 1
   STATIONS=kitchen
   ```

   **Important:**
   - Replace `192.168.1.50:5000` with your actual CMS backend URL
   - Paste the token from Step 2
   - Set stations (kitchen, bar, cashier) separated by commas

### Step 5: Test Agent
Run the agent manually to verify configuration:
```cmd
npm start
```

**Expected output:**
```
[INFO] Starting CMS Print Agent
[INFO] Windows printers discovered: EPSON TM-T20III, Microsoft Print to PDF
[INFO] Backend connection test successful
[INFO] Print agent is now running
[INFO] No pending jobs
```

Press `Ctrl+C` to stop.

### Step 6: Configure Printer in CMS
1. Log in to CMS as **Owner**
2. Navigate to **Settings → Printers**
3. Add or edit the **Kitchen** printer
4. Select **Transport Type: Windows Print Agent**
5. Enter **Printer Name** exactly as shown in Windows
   - Example: `EPSON TM-T20III`
   - Find exact name in Control Panel → Devices and Printers
6. Click **Test Print** to verify

---

## Running as a Windows Service

For production use, configure the agent to start automatically with Windows.

### Option 1: Using Task Scheduler (Recommended for POS)
1. Open **Task Scheduler**
2. Create Task → **General** tab:
   - Name: `CMS Print Agent`
   - **Run whether user is logged on or not**
   - **Run with highest privileges**
3. **Triggers** tab:
   - New → **At startup**
4. **Actions** tab:
   - New → **Start a program**
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `C:\CMS\print-agent\dist\index.js`
   - Start in: `C:\CMS\print-agent`
5. **Settings** tab:
   - ✅ If task fails, restart every 1 minute
   - Attempt restart up to 3 times
6. Save and test by restarting Windows

### Option 2: Using NSSM (Non-Sucking Service Manager)
1. Download NSSM from [nssm.cc](https://nssm.cc/)
2. Extract and run as Administrator:
   ```cmd
   nssm install CMSPrintAgent
   ```
3. Configure:
   - **Path:** `C:\Program Files\nodejs\node.exe`
   - **Startup directory:** `C:\CMS\print-agent`
   - **Arguments:** `dist\index.js`
4. Install and start:
   ```cmd
   nssm start CMSPrintAgent
   ```

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CMS_API_URL` | ✅ Yes | - | Backend API URL (e.g., `http://192.168.1.50:5000/api`) |
| `AGENT_TOKEN` | ✅ Yes | - | 64-character authentication token from CMS |
| `AGENT_NAME` | No | `Unknown Agent` | Display name for this agent |
| `STATIONS` | No | `kitchen` | Comma-separated stations: `kitchen,bar,cashier` |
| `LOG_LEVEL` | No | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `POLL_INTERVAL_MS` | No | `3000` | How often to check for new jobs (milliseconds) |
| `MAX_RECONNECT_ATTEMPTS` | No | `10` | Max reconnection attempts before shutdown |
| `RECONNECT_DELAY_MS` | No | `5000` | Initial delay between reconnection attempts |

---

## Troubleshooting

### Agent won't start
**Error:** `CMS_API_URL is required in .env file`
- **Solution:** Create `.env` file from `.env.example` and configure it

**Error:** `Printer module not available`
- **Solution:** Agent must run on Windows. Install on the POS computer, not the server.

### Cannot connect to backend
**Error:** `Cannot connect to CMS backend`
- **Solution:** Verify `CMS_API_URL` in `.env` points to the correct backend server
- Check firewall allows connection from POS computer to server

### Authentication failed
**Error:** `Agent authentication failed - check AGENT_TOKEN`
- **Solution:** Verify token in `.env` matches the one from agent registration
- Check if agent was revoked in CMS → Print Agents

### Printer not found
**Error:** `Printer "EPSON TM-T20III" is not available or offline`
- **Solution:** 
  1. Verify exact printer name in Control Panel → Devices and Printers
  2. Check printer is powered on and connected
  3. Print a Windows test page to verify driver works
  4. Update printer name in CMS → Settings → Printers

### Print job fails silently
- Check Windows Print Spooler service is running:
  ```cmd
  sc query spooler
  ```
- Restart spooler if needed:
  ```cmd
  net stop spooler
  net start spooler
  ```

### Agent keeps crashing
- Check logs in console output or redirect to file:
  ```cmd
  npm start > print-agent.log 2>&1
  ```
- Verify Node.js version is 18+:
  ```cmd
  node --version
  ```

---

## Operational Notes

### Print Job Lifecycle
1. **Order Created** in CMS
2. **PrintJob QUEUED** in database
3. **Agent Claims Job** (status → PRINTING)
4. **Agent Sends to Spooler** (RAW mode)
5. **Agent Acknowledges** (status → PRINTED or FAILED)

### Idempotency
- Each PrintJob has a unique ID
- Agent uses optimistic locking when claiming
- If agent crashes, job remains QUEUED for retry
- Duplicate printing is prevented by claim mechanism

### Reconnection Behavior
- Agent automatically reconnects on network failure
- Uses exponential backoff (5s, 10s, 20s, 40s, 60s max)
- After 10 failed attempts, agent shuts down
- Restart agent or service to resume

### Multi-Agent Support
- Multiple POS computers can run agents simultaneously
- Each agent processes jobs for its configured stations
- Optimistic locking prevents duplicate printing
- Agents with same station share the workload

---

## Security Considerations

### Agent Token
- **Never commit `.env` to version control**
- Token grants full access to print jobs for your cafe
- Rotate token if compromised via CMS → Print Agents → Revoke

### Local Configuration Endpoint
- Agent does **not** expose HTTP endpoints
- All communication is outbound to backend
- No incoming connections required

### Printer Access
- Agent runs with privileges of logged-in user or service account
- Ensure Windows user has permission to print

---

## Maintenance

### Updating Agent
1. Stop the agent/service
2. Pull/extract new version
3. Run `npm install` (if dependencies changed)
4. Run `npm run build`
5. Restart agent/service

### Viewing Logs
- **Console mode:** Logs print to terminal
- **Service mode:** Redirect stdout to file in Task Scheduler or NSSM
- **Recommended:** Use Windows Event Viewer for service logs

### Monitoring
- Check agent status in CMS → Print Agents
- Last heartbeat updated every time agent fetches jobs
- **Online:** Heartbeat < 30 seconds ago
- **Offline:** Heartbeat > 30 seconds or never

---

## Support

For issues or questions:
1. Check this README troubleshooting section
2. Review agent logs for error messages
3. Verify backend health at: `http://your-server/api/health`
4. Contact your system administrator

---

## License

Proprietary - For use with CMS POS only.
