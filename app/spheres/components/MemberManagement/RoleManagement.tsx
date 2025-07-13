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

// Interfejs dla roli
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

// Interfejs dla uprawnień
interface Permission {
  id: string;
  name: string;
  category: 'content' | 'members' | 'finance' | 'events' | 'admin';
  description: string;
  isGranted: boolean;
  isInherited?: boolean;
  inheritedFrom?: string;
}

// Interfejs dla członka z rolą
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
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [showRoleDetails, setShowRoleDetails] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // Formularz nowej roli
  const [newRole, setNewRole] = useState({
    name: '',
    displayName: '',
    color: '#8B5CF6',
    level: 1,
    description: '',
    permissions: [] as string[]
  });

  // Wszystkie dostępne uprawnienia
  const allPermissions: Permission[] = [
    // Zawartość
    { id: 'content_create', name: 'Tworzenie postów', category: 'content', description: 'Może tworzyć nowe posty', isGranted: false },
    { id: 'content_edit', name: 'Edycja postów', category: 'content', description: 'Może edytować posty innych', isGranted: false },
    { id: 'content_delete', name: 'Usuwanie postów', category: 'content', description: 'Może usuwać posty', isGranted: false },
    { id: 'content_moderate', name: 'Moderacja treści', category: 'content', description: 'Może moderować treści', isGranted: false },
    
    // Członkowie
    { id: 'members_view', name: 'Przeglądanie członków', category: 'members', description: 'Może przeglądać listę członków', isGranted: false },
    { id: 'members_invite', name: 'Zapraszanie członków', category: 'members', description: 'Może zapraszać nowych członków', isGranted: false },
    { id: 'members_kick', name: 'Wyrzucanie członków', category: 'members', description: 'Może wyrzucać członków', isGranted: false },
    { id: 'members_ban', name: 'Banowanie członków', category: 'members', description: 'Może banować członków', isGranted: false },
    { id: 'members_roles', name: 'Zarządzanie rolami', category: 'members', description: 'Może przypisywać role', isGranted: false },
    
    // Finanse
    { id: 'finance_view', name: 'Przeglądanie finansów', category: 'finance', description: 'Może przeglądać dane finansowe', isGranted: false },
    { id: 'finance_withdraw', name: 'Wypłaty', category: 'finance', description: 'Może wypłacać środki', isGranted: false },
    { id: 'finance_pricing', name: 'Zarządzanie cenami', category: 'finance', description: 'Może zmieniać ceny subskrypcji', isGranted: false },
    
    // Eventy
    { id: 'events_create', name: 'Tworzenie eventów', category: 'events', description: 'Może tworzyć nowe eventy', isGranted: false },
    { id: 'events_manage', name: 'Zarządzanie eventami', category: 'events', description: 'Może zarządzać eventami', isGranted: false },
    { id: 'events_moderate', name: 'Moderacja eventów', category: 'events', description: 'Może moderować eventy', isGranted: false },
    
    // Administracja
    { id: 'admin_settings', name: 'Ustawienia społeczności', category: 'admin', description: 'Może zmieniać ustawienia', isGranted: false },
    { id: 'admin_roles', name: 'Zarządzanie rolami', category: 'admin', description: 'Może tworzyć i edytować role', isGranted: false },
    { id: 'admin_analytics', name: 'Analityka', category: 'admin', description: 'Może przeglądać analitykę', isGranted: false },
    { id: 'admin_owner', name: 'Prawa właściciela', category: 'admin', description: 'Pełne uprawnienia właściciela', isGranted: false }
  ];

  // Przykładowe role
  const [allRoles, setAllRoles] = useState<Role[]>([
    {
      id: '1',
      name: 'owner',
      displayName: 'Właściciel',
      color: '#8B5CF6',
      level: 10,
      memberCount: 1,
      description: 'Pełne uprawnienia do zarządzania społecznością',
      permissions: allPermissions.map(p => ({ ...p, isGranted: true })),
      isDefault: false,
      isSystemRole: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '2',
      name: 'admin',
      displayName: 'Administrator',
      color: '#EF4444',
      level: 8,
      memberCount: 2,
      description: 'Zarządzanie członkami i moderacja treści',
      permissions: allPermissions.map(p => ({ 
        ...p, 
        isGranted: !p.id.includes('admin_owner') && !p.id.includes('finance_withdraw')
      })),
      isDefault: false,
      isSystemRole: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '3',
      name: 'moderator',
      displayName: 'Moderator',
      color: '#3B82F6',
      level: 6,
      memberCount: 5,
      description: 'Moderacja treści i wsparcie członków',
      permissions: allPermissions.map(p => ({ 
        ...p, 
        isGranted: p.category === 'content' || p.id === 'members_view' || p.id === 'members_kick'
      })),
      isDefault: false,
      isSystemRole: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '4',
      name: 'member',
      displayName: 'Członek',
      color: '#6B7280',
      level: 1,
      memberCount: 50,
      description: 'Podstawowe uprawnienia członka społeczności',
      permissions: allPermissions.map(p => ({ 
        ...p, 
        isGranted: p.id === 'content_create' || p.id === 'members_view'
      })),
      isDefault: true,
      isSystemRole: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);

  // Funkcja określająca ikonę roli
  const getRoleIcon = (level: number) => {
    if (level >= 9) return <Crown className="w-4 h-4" />;
    if (level >= 7) return <Shield className="w-4 h-4" />;
    if (level >= 5) return <Star className="w-4 h-4" />;
    return <Users className="w-4 h-4" />;
  };

  // Funkcja grupowania uprawnień
  const getPermissionsByCategory = (permissions: Permission[]) => {
    const groups = permissions.reduce((acc, perm) => {
      if (!acc[perm.category]) {
        acc[perm.category] = [];
      }
      acc[perm.category].push(perm);
      return acc;
    }, {} as Record<string, Permission[]>);

    return groups;
  };

  // Funkcja tworzenia nowej roli
  const handleCreateRole = () => {
    const roleData: Partial<Role> = {
      name: newRole.name.toLowerCase().replace(/\s+/g, '_'),
      displayName: newRole.displayName,
      color: newRole.color,
      level: newRole.level,
      description: newRole.description,
      permissions: allPermissions.map(p => ({
        ...p,
        isGranted: newRole.permissions.includes(p.id)
      })),
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

  // Funkcja aktualizacji uprawnień
  const handlePermissionToggle = (roleId: string, permissionId: string) => {
    const role = allRoles.find(r => r.id === roleId);
    if (!role) return;

    const updatedPermissions = role.permissions.map(p => 
      p.id === permissionId ? { ...p, isGranted: !p.isGranted } : p
    );

    onUpdateRole(roleId, { permissions: updatedPermissions });
  };

  return (
    <div className="space-y-6">
      {/* Nawigacja */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'roles', label: 'Role', icon: Crown },
          { id: 'members', label: 'Przypisania', icon: Users },
          { id: 'permissions', label: 'Uprawnienia', icon: Settings }
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

      {/* Tab: Role */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          {/* Nagłówek */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Role w społeczności</h3>
            <button
              onClick={() => setShowCreateRole(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nowa rola
            </button>
          </div>

          {/* Lista ról */}
          <div className="space-y-3">
            {allRoles.map(role => (
              <div key={role.id} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Ikona roli */}
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${role.color}20`, color: role.color }}
                    >
                      {getRoleIcon(role.level)}
                    </div>

                    {/* Informacje o roli */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-white">{role.displayName}</h4>
                        <span className="text-sm text-gray-400">lvl {role.level}</span>
                        {role.isDefault && (
                          <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-full">
                            Domyślna
                          </span>
                        )}
                        {role.isSystemRole && (
                          <span className="px-2 py-1 text-xs bg-gray-500/20 text-gray-400 rounded-full">
                            System
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-400 mt-1">{role.description}</div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {role.memberCount} członków
                        </span>
                        <span className="flex items-center gap-1">
                          <Settings className="w-3 h-3" />
                          {role.permissions.filter(p => p.isGranted).length} uprawnień
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Akcje */}
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

                {/* Szczegóły roli */}
                <AnimatePresence>
                  {showRoleDetails === role.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 pt-4 border-t border-gray-700"
                    >
                      <div className="space-y-4">
                        <h5 className="font-medium text-white">Uprawnienia</h5>
                        
                        {Object.entries(getPermissionsByCategory(role.permissions)).map(([category, permissions]) => (
                          <div key={category} className="space-y-2">
                            <h6 className="text-sm font-medium text-gray-300 capitalize">
                              {category === 'content' ? 'Zawartość' :
                               category === 'members' ? 'Członkowie' :
                               category === 'finance' ? 'Finanse' :
                               category === 'events' ? 'Eventy' :
                               category === 'admin' ? 'Administracja' : category}
                            </h6>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {permissions.map(permission => (
                                <div 
                                  key={permission.id}
                                  className={`flex items-center gap-2 p-2 rounded-lg ${
                                    permission.isGranted 
                                      ? 'bg-green-500/10 border border-green-500/20' 
                                      : 'bg-gray-700/30 border border-gray-600/50'
                                  }`}
                                >
                                  {permission.isGranted ? (
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-gray-500" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-sm ${
                                      permission.isGranted ? 'text-green-400' : 'text-gray-400'
                                    }`}>
                                      {permission.name}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                      {permission.description}
                                    </div>
                                  </div>
                                  {!role.isSystemRole && (
                                    <button
                                      onClick={() => handlePermissionToggle(role.id, permission.id)}
                                      className="p-1 hover:bg-gray-600/50 rounded transition-colors"
                                    >
                                      {permission.isGranted ? (
                                        <Lock className="w-3 h-3" />
                                      ) : (
                                        <Unlock className="w-3 h-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
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

      {/* Tab: Przypisania ról */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Przypisania ról</h3>
          
          <div className="space-y-3">
            {members.map(member => (
              <div key={member.id} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        {member.avatar ? (
                          <img src={member.avatar} alt={member.username} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-white font-bold">
                            {member.username.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      {member.isOnline && (
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800" />
                      )}
                    </div>

                    {/* Informacje o członku */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-white">{member.username}</h4>
                        <div className="flex items-center gap-1">
                          {getRoleIcon(allRoles.find(r => r.id === member.currentRole)?.level || 1)}
                          <span className="text-sm text-gray-400">
                            {allRoles.find(r => r.id === member.currentRole)?.displayName || 'Brak roli'}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-400 truncate">{member.address}</div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span>Rola od: {new Date(member.roleAssignedAt).toLocaleDateString()}</span>
                        <span>Przez: {member.roleAssignedBy}</span>
                      </div>
                    </div>
                  </div>

                  {/* Akcje */}
                  <div className="flex items-center gap-2">
                    <select
                      value={member.currentRole}
                      onChange={(e) => onAssignRole(member.id, e.target.value)}
                      className="px-3 py-1 bg-gray-700/50 border border-gray-600 rounded text-sm focus:ring-2 focus:ring-purple-500"
                    >
                      {allRoles.map(role => (
                        <option key={role.id} value={role.id}>
                          {role.displayName}
                        </option>
                      ))}
                    </select>
                    
                    <button
                      onClick={() => onRemoveRole(member.id)}
                      className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors text-red-400"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Nowa rola */}
      <AnimatePresence>
        {showCreateRole && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700"
            >
              <h3 className="text-lg font-semibold text-white mb-4">Nowa rola</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nazwa roli
                    </label>
                    <input
                      type="text"
                      value={newRole.displayName}
                      onChange={(e) => setNewRole({...newRole, displayName: e.target.value, name: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Poziom (1-10)
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Kolor
                  </label>
                  <input
                    type="color"
                    value={newRole.color}
                    onChange={(e) => setNewRole({...newRole, color: e.target.value})}
                    className="w-full h-10 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Opis
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
                    Uprawnienia
                  </label>
                  <div className="space-y-3 max-h-40 overflow-y-auto">
                    {Object.entries(getPermissionsByCategory(allPermissions)).map(([category, permissions]) => (
                      <div key={category} className="space-y-2">
                        <h6 className="text-sm font-medium text-gray-300 capitalize">
                          {category === 'content' ? 'Zawartość' :
                           category === 'members' ? 'Członkowie' :
                           category === 'finance' ? 'Finanse' :
                           category === 'events' ? 'Eventy' :
                           category === 'admin' ? 'Administracja' : category}
                        </h6>
                        <div className="grid grid-cols-1 gap-2">
                          {permissions.map(permission => (
                            <label key={permission.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={newRole.permissions.includes(permission.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNewRole({...newRole, permissions: [...newRole.permissions, permission.id]});
                                  } else {
                                    setNewRole({...newRole, permissions: newRole.permissions.filter(p => p !== permission.id)});
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-300">{permission.name}</div>
                                <div className="text-xs text-gray-500">{permission.description}</div>
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
                    className="flex-1 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
                  >
                    Utwórz rolę
                  </button>
                  <button
                    onClick={() => setShowCreateRole(false)}
                    className="flex-1 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors"
                  >
                    Anuluj
                  </button>
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