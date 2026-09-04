import React from 'react';
import { AttendanceCalendar } from '../../components/common/AttendanceCalendar';

export const ManagerAttendance: React.FC = () => {
  return <AttendanceCalendar isOwner={false} />;
};

export default ManagerAttendance;
