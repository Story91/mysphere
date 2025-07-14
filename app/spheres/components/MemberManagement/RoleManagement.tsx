'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Crown, 
  Shield, 
  Star, 
  Users, 
  Settings, 
  Edit3, 
  Trash2, 
  Plus,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  UserPlus,
  UserMinus,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { 
  Permission, 
  PermissionCategory, 
  getPermissionCategory, 
  getPermissionDisplayName, 
  getPermissionDescription,
  getDefaultPermissions,
  MemberRole
} from '../../hooks/useSpheresContract';

// Role interface with Permission enum
interface Role {
  id: string;
  name: string;
  displayName: string;
  color: string;
  level: number; // 1-10, wyższe = więcej uprawnień
  memberCount: number;
  description: string;
  permissions: Permission[];
  isDefault: boolean;
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Member with role interface
interface MemberWithRole {
  id: string;
  username: string;
  address: string;
  avatar: string;
  currentRole: string;
  roleAssignedAt: Date;
  roleAssignedBy: string;
  isOnline: boolean;
}

interface RoleManagementProps {
  communityId: string;
  roles: Role[];
  members: MemberWithRole[];
  onCreateRole: (roleData: Partial<Role>) => void;
  onUpdateRole: (roleId: string, roleData: Partial<Role>) => void;
  onDeleteRole: (roleId: string) => void;
  onAssignRole: (memberId: string, roleId: string) => void;
  onRemoveRole: (memberId: string) => void;
  currentUserRole: string;
}

const RoleManagement: React.FC<RoleManagementProps> = ({
  communityId,
  roles,
  members,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onAssignRole,
  onRemoveRole,
  currentUserRole
}) => {
  const [activeTab, setActiveTab] = useState<'roles' | 'members' | 'permissions'>('roles');
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showRoleDetails, setShowRoleDetails] = useState<string | null>(null);
  const [newRole, setNewRole] = useState({
    name: '',
    displayName: '',
    color: '#8B5CF6',
    level: 1,
    description: '',
    permissions: [] as Permission[]
  });

  // Get all available permissions
  const allPermissions = Object.values(Permission);

  // System roles with default permissions
  const systemRoles: Role[] = [
    {
      id: 'member',
      name: 'member',
      displayName: 'Member',
      color: '#6B7280',
      level: 1,
      memberCount: 0,
      description: 'Basic community member',
      permissions: getDefaultPermissions(MemberRole.MEMBER),
      isDefault: true,
      isSystemRole: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'moderator',
      name: 'moderator',
      displayName: 'Moderator',
      color: '#F59E0B',
      level: 5,
      memberCount: 0,
      description: 'Community moderator with content management permissions',
      permissions: getDefaultPermissions(MemberRole.MODERATOR),
      isDefault: false,
      isSystemRole: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'admin',
      name: 'admin',
      displayName: 'Administrator',
      color: '#EF4444',
      level: 10,
      memberCount: 0,
      description: 'Full administrative access',
      permissions: getDefaultPermissions(MemberRole.ADMIN),
      isDefault: false,
      isSystemRole: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  // Combine roles with system roles
  const allRoles: Role[] = [...systemRoles, ...roles];

  // Function to get role icon
  const getRoleIcon = (level: number) => {
    if (level >= 9) return <Crown className="w-4 h-4" />;
    if (level >= 7) return <Shield className="w-4 h-4" />;
    if (level >= 5) return <Star className="w-4 h-4" />;
    return <Users className="w-4 h-4" />;
  };

  // Function to group permissions by category
  const getPermissionsByCategory = (permissions: Permission[]) => {
    const groups: Record<PermissionCategory, Permission[]> = {
      [PermissionCategory.CONTENT]: [],
      [PermissionCategory.MEMBERS]: [],
      [PermissionCategory.FINANCE]: [],
      [PermissionCategory.EVENTS]: [],
      [PermissionCategory.ADMIN]: []
    };

    permissions.forEach(permission => {
      const category = getPermissionCategory(permission);
      groups[category].push(permission);
    });

    return groups;
  };

  // Function to create new role
  const handleCreateRole = () => {
    const roleData: Partial<Role> = {
      name: newRole.name.toLowerCase().replace(/\s+/g, '_'),
      displayName: newRole.displayName,
      color: newRole.color,
      level: newRole.level,
      description: newRole.description,
      permissions: newRole.permissions,
      isDefault: false,
      isSystemRole: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    onCreateRole(roleData);
    setShowCreateRole(false);
    setNewRole({
      name: '',
      displayName: '',
      color: '#8B5CF6',
      level: 1,
      description: '',
      permissions: []
    });
  };

  // Function to update permissions
  const handlePermissionToggle = (roleId: string, permission: Permission) => {
    const role = allRoles.find(r => r.id === roleId);
    if (!role) return;

    const hasPermission = role.permissions.includes(permission);
    const updatedPermissions = hasPermission 
      ? role.permissions.filter(p => p !== permission)
      : [...role.permissions, permission];

    onUpdateRole(roleId, { permissions: updatedPermissions });
  };

  // Function to get category display name
  const getCategoryDisplayName = (category: PermissionCategory): string => {
    const names = {
      [PermissionCategory.CONTENT]: 'Content',
      [PermissionCategory.MEMBERS]: 'Members',
      [PermissionCategory.FINANCE]: 'Finance',
      [PermissionCategory.EVENTS]: 'Events',
      [PermissionCategory.ADMIN]: 'Administration'
    };
    return names[category] || category;
  };

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'roles', label: 'Roles', icon: Crown },
          { id: 'members', label: 'Assignments', icon: Users },
          { id: 'permissions', label: 'Permissions', icon: Settings }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Roles */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Community Roles</h3>
            <button
              onClick={() => setShowCreateRole(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Role
            </button>
          </div>

          {/* Roles list */}
          <div className="space-y-3">
            {allRoles.map(role => (
              <div key={role.id} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Role icon */}
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${role.color}20`, color: role.color }}
                    >
                      {getRoleIcon(role.level)}
                    </div>

                    {/* Role information */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-white">{role.displayName}</h4>
                        <span className="text-sm text-gray-400">lvl {role.level}</span>
                        {role.isDefault && (
                          <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-full">
                            Default
                          </span>
                        )}
                        {role.isSystemRole && (
                          <span className="px-2 py-1 text-xs bg-gray-500/20 text-gray-400 rounded-full">
                            System
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-400 mt-1">{role.description}</div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {role.memberCount} members
                        </span>
                        <span className="flex items-center gap-1">
                          <Settings className="w-3 h-3" />
                          {role.permissions.length} permissions
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowRoleDetails(showRoleDetails === role.id ? null : role.id)}
                      className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                    >
                      {showRoleDetails === role.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    
                    {!role.isSystemRole && (
                      <>
                        <button
                          onClick={() => setEditingRole(role)}
                          className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteRole(role.id)}
                          className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Role details */}
                <AnimatePresence>
                  {showRoleDetails === role.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 pt-4 border-t border-gray-700"
                    >
                      <div className="space-y-4">
                        <h5 className="font-medium text-white">Permissions</h5>
                        
                        {Object.entries(getPermissionsByCategory(role.permissions)).map(([category, permissions]) => (
                          permissions.length > 0 && (
                            <div key={category} className="space-y-2">
                              <h6 className="text-sm font-medium text-gray-300">
                                {getCategoryDisplayName(category as PermissionCategory)}
                              </h6>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {permissions.map(permission => (
                                  <div 
                                    key={permission}
                                    className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20"
                                  >
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-green-400">
                                        {getPermissionDisplayName(permission)}
                                      </div>
                                      <div className="text-xs text-gray-500 truncate">
                                        {getPermissionDescription(permission)}
                                      </div>
                                    </div>
                                    
                                    {!role.isSystemRole && (
                                      <button
                                        onClick={() => handlePermissionToggle(role.id, permission)}
                                        className="p-1 hover:bg-gray-600/50 rounded transition-colors"
                                      >
                                        <Lock className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Role assignments */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Role Assignments</h3>
          
          <div className="space-y-3">
            {members.map(member => (
              <div key={member.id} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {member.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{member.username}</h4>
                      <div className="text-sm text-gray-400">{member.address}</div>
                      <div className="text-xs text-gray-500">
                        Role assigned: {member.roleAssignedAt.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 text-sm bg-purple-500/20 text-purple-400 rounded-full">
                      {member.currentRole}
                    </span>
                    <select
                      value={member.currentRole}
                      onChange={(e) => onAssignRole(member.id, e.target.value)}
                      className="px-3 py-1 text-sm bg-gray-700/50 border border-gray-600 rounded focus:ring-2 focus:ring-purple-500"
                    >
                      {allRoles.map(role => (
                        <option key={role.id} value={role.id}>
                          {role.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create role modal */}
      <AnimatePresence>
        {showCreateRole && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700"
            >
              <div className="p-6 space-y-6">
                <h3 className="text-xl font-semibold text-white">Create New Role</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Role Name
                      </label>
                      <input
                        type="text"
                        value={newRole.name}
                        onChange={(e) => setNewRole({...newRole, name: e.target.value})}
                        className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., senior-member"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={newRole.displayName}
                        onChange={(e) => setNewRole({...newRole, displayName: e.target.value})}
                        className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., Senior Member"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Level (1-10)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={newRole.level}
                        onChange={(e) => setNewRole({...newRole, level: parseInt(e.target.value) || 1})}
                        className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Color
                      </label>
                      <input
                        type="color"
                        value={newRole.color}
                        onChange={(e) => setNewRole({...newRole, color: e.target.value})}
                        className="w-full h-10 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={newRole.description}
                      onChange={(e) => setNewRole({...newRole, description: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Permissions
                    </label>
                    <div className="space-y-3 max-h-40 overflow-y-auto">
                      {Object.entries(getPermissionsByCategory(allPermissions)).map(([category, permissions]) => (
                        <div key={category} className="space-y-2">
                          <h6 className="text-sm font-medium text-gray-300">
                            {getCategoryDisplayName(category as PermissionCategory)}
                          </h6>
                          
                          <div className="grid grid-cols-1 gap-2">
                            {permissions.map(permission => (
                              <label key={permission} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={newRole.permissions.includes(permission)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewRole({...newRole, permissions: [...newRole.permissions, permission]});
                                    } else {
                                      setNewRole({...newRole, permissions: newRole.permissions.filter(p => p !== permission)});
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-gray-300">{getPermissionDisplayName(permission)}</div>
                                  <div className="text-xs text-gray-500">{getPermissionDescription(permission)}</div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <button
                      onClick={handleCreateRole}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
                    >
                      Create Role
                    </button>
                    <button
                      onClick={() => setShowCreateRole(false)}
                      className="flex-1 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RoleManagement; 