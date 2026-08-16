#!/bin/bash
# Bulk replace err.response?.data?.error with extractErrorMessage(err) in tsx files

# Files to update (excluding already fixed files)
files=(
  "src/pages/manager/ManagerPayroll.tsx"
  "src/pages/manager/ManagerDashboard.tsx"
  "src/pages/shared/ProfilePage.tsx"
  "src/pages/owner/OwnerPrinters.tsx"
  "src/pages/owner/OwnerFinance.tsx"
  "src/pages/cashier/CashierDashboard.tsx"
  "src/components/common/ExpensesTracker.tsx"
  "src/components/common/AttendanceCalendar.tsx"
  "src/components/cashier/CashierOrderingPanel.tsx"
  "src/components/settings/TableCountSetting.tsx"
  "src/components/settings/CashierOrderingToggle.tsx"
  "src/components/settings/BusinessProfileSection.tsx"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    # Add import if not already present
    if ! grep -q "extractErrorMessage" "$file"; then
      sed -i '' '/^import.*from.*utils/a\
import { extractErrorMessage } from '"'"'../../utils/errorHandler'"'"';
' "$file" 2>/dev/null || sed -i '' '/^import/a\
import { extractErrorMessage } from '"'"'../utils/errorHandler'"'"';
' "$file"
    fi
    
    # Replace error patterns
    sed -i '' 's/err\.response\?\.data\?\.error || /extractErrorMessage(err, /g' "$file"
    sed -i '' 's/message: err\.response\?\.data\?\.error/message: extractErrorMessage(err)/g' "$file"
    sed -i '' 's/setError(err\.response\?\.data\?\.error/setError(extractErrorMessage(err/g' "$file"
    sed -i '' 's/setStaffError(err\.response\?\.data\?\.error/setStaffError(extractErrorMessage(err/g' "$file"
  fi
done

echo "Done!"
