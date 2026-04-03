import React from 'react';
import { getStoredUser } from '../lib/api';

const UserChip = ({ fallbackName = 'User', fallbackRole = 'Team Member', avatarSeed = 'default-user' }) => {
  const user = getStoredUser();
  const name = user?.fullName || fallbackName;
  const role = user?.role ? String(user.role).replace('_', ' ') : fallbackRole;
  const avatarKey = user?.id || avatarSeed;

  return (
    <div className="os-user-chip">
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
        <div className="os-muted" style={{ fontSize: 11 }}>{role}</div>
      </div>
      <img className="os-avatar" src={`https://i.pravatar.cc/72?u=${avatarKey}`} alt={name} />
    </div>
  );
};

export default UserChip;
