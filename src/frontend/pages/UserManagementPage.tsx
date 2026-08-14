import { useState, useEffect, useMemo } from 'react'
import { Plus, UserCog, Shield, ShieldCheck, User as UserIcon, Users as UsersIcon, Edit, KeyRound, CheckSquare, XSquare } from 'lucide-react'
import { Button, Loading, Alert, Modal } from '@/components/ui'
import { Input, Select } from '@/components/forms'
import { useAuth } from '@/context/AuthContext'
import { apiRequest } from '@/utils/api'
import { parseServerDate, getPasswordStrengthError, cn } from '@/utils'
import { NameListManager } from '@/components/composite'
import type { User } from '@/types'

interface CreateUserForm {
  username: string
  password: string
  confirmPassword: string
  firstName: string
  lastName: string
  role: 'user' | 'admin'
}

interface EditUserForm {
  firstName: string
  lastName: string
  isActive: boolean
}

interface PasswordForm {
  newPassword: string
  confirmPassword: string
}

const UserManagementPage = () => {
  const { token, isAuthenticated, user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    username: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    role: 'user'
  })
  const [formErrors, setFormErrors] = useState<Partial<CreateUserForm>>({})

  // Edit user state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [updating, setUpdating] = useState(false)
  const [editForm, setEditForm] = useState<EditUserForm>({
    firstName: '',
    lastName: '',
    isActive: true
  })
  const [editFormErrors, setEditFormErrors] = useState<Partial<EditUserForm>>({})

  // Reset password state
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    newPassword: '',
    confirmPassword: ''
  })
  const [passwordFormErrors, setPasswordFormErrors] = useState<Partial<PasswordForm>>({})

  // Admin accounts always sink to the very bottom, below inactive regular
  // users too; within the regular-user group, active users come before
  // inactive ones; and within each of those groups, alphabetical by name.
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.role !== b.role) return a.role === 'admin' ? 1 : -1
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase()
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [users])

  const activeAdminCount = useMemo(
    () => users.filter(u => u.role === 'admin' && u.isActive).length,
    [users]
  )

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      setError('Access denied. Admin privileges required.')
      setLoading(false)
      return
    }
    fetchUsers()
  }, [currentUser])

  const fetchUsers = async () => {
    try {
      setLoading(true)

      if (!isAuthenticated || !token) {
        setError('Please log in to view users')
        setLoading(false)
        return
      }

      const data = await apiRequest('/users')
      setUsers(data.data || [])
    } catch (err) {
      setError('Failed to load users')
      console.error('Error fetching users:', err)
    } finally {
      setLoading(false)
    }
  }

  const validateForm = (): boolean => {
    const errors: Partial<CreateUserForm> = {}

    if (!createForm.username.trim()) {
      errors.username = 'Username is required'
    } else if (createForm.username.length < 3) {
      errors.username = 'Username must be at least 3 characters'
    }

    if (!createForm.password.trim()) {
      errors.password = 'Password is required'
    } else {
      const passwordError = getPasswordStrengthError(createForm.password)
      if (passwordError) errors.password = passwordError
    }

    if (!createForm.confirmPassword.trim()) {
      errors.confirmPassword = 'Confirm password is required'
    } else if (createForm.password !== createForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }

    if (!createForm.firstName.trim()) {
      errors.firstName = 'First name is required'
    }

    if (!createForm.lastName.trim()) {
      errors.lastName = 'Last name is required'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreateUser = async () => {
    if (!validateForm()) return

    try {
      setCreating(true)

      // Exclude confirmPassword when sending to API
      const { confirmPassword, ...payload } = createForm
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      await fetchUsers()
      setShowCreateModal(false)
      setCreateForm({
        username: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        role: 'user'
      })
      setFormErrors({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
      console.error('Error creating user:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      await apiRequest(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({
          isActive: !currentStatus
        }),
      })

      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user status')
      console.error('Error updating user status:', err)
    }
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user)
    setEditForm({
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive
    })
    setEditFormErrors({})
    setShowEditModal(true)
  }

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      setError("You can't delete your own account while logged in.")
      return
    }

    const sure = window.confirm('Delete this user? This cannot be undone.')
    if (!sure) return

    try {
      await apiRequest(`/users/${userId}`, {
        method: 'DELETE',
      })

      setShowEditModal(false)
      setEditingUser(null)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
      console.error('Error deleting user:', err)
    }
  }

  const validateEditForm = (): boolean => {
    const errors: Partial<EditUserForm> = {}

    if (!editForm.firstName.trim()) {
      errors.firstName = 'First name is required'
    }

    if (!editForm.lastName.trim()) {
      errors.lastName = 'Last name is required'
    }

    setEditFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleUpdateUser = async () => {
    if (!validateEditForm() || !editingUser) return

    try {
      setUpdating(true)

      await apiRequest(`/users/${editingUser.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      })

      await fetchUsers()
      setShowEditModal(false)
      setEditingUser(null)
      setEditForm({
        firstName: '',
        lastName: '',
        isActive: true
      })
      setEditFormErrors({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
      console.error('Error updating user:', err)
    } finally {
      setUpdating(false)
    }
  }

  const handleOpenResetPassword = (user: User) => {
    setShowEditModal(false)
    setPasswordTarget(user)
    setPasswordForm({ newPassword: '', confirmPassword: '' })
    setPasswordFormErrors({})
    setShowPasswordModal(true)
  }

  const validatePasswordForm = (): boolean => {
    const errors: Partial<PasswordForm> = {}

    if (!passwordForm.newPassword.trim()) {
      errors.newPassword = 'New password is required'
    } else {
      const passwordError = getPasswordStrengthError(passwordForm.newPassword)
      if (passwordError) errors.newPassword = passwordError
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }

    setPasswordFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleResetPassword = async () => {
    if (!validatePasswordForm() || !passwordTarget) return

    try {
      setResettingPassword(true)

      await apiRequest(`/users/${passwordTarget.id}/change-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: passwordForm.newPassword }),
      })

      setShowPasswordModal(false)
      setPasswordTarget(null)
      setPasswordForm({ newPassword: '', confirmPassword: '' })
      setPasswordFormErrors({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
      console.error('Error resetting password:', err)
    } finally {
      setResettingPassword(false)
    }
  }

  const formatDate = (dateString: string) => {
    return parseServerDate(dateString).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getRoleIcon = (role: string) => {
    return role === 'admin' ? (
      <Shield className="w-4 h-4 text-blue-600" />
    ) : (
      <UserIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
    )
  }

  if (currentUser?.role !== 'admin') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-16">
          <Shield className="mx-auto h-12 w-12 text-gray-400" />
          <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">Access Denied</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            You need admin privileges to access user management.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">User Management</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage system users and their permissions
          </p>
        </div>
        <Loading />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">User Management</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Manage system users and their permissions
            </p>
          </div>
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            Create User
          </Button>
        </div>
      </div>

      {error && (
        <Alert type="error" message={error} onClose={() => setError('')} />
      )}

      <div className="card">
        <div className="card-body">
          {users.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 dark:text-gray-400">
                <UserCog className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No users found</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Get started by creating your first user.
                </p>
              </div>
            </div>
          ) : (
            <>
              {users.length > 0 && (
                <div className="mb-4 text-sm text-gray-500 dark:text-gray-400 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Scroll horizontally to view all columns
                </div>
              )}
              <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-700 md:rounded-xl">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[200px]">
                      User
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[120px]">
                      Role
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[160px]">
                      Created
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[160px]">
                      Last Login
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[180px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {sortedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                              <UserIcon className="h-5 w-5 text-gray-600 dark:text-gray-200" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {user.firstName} {user.lastName}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              @{user.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getRoleIcon(user.role)}
                          <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                            user.role === 'admin'
                              ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700/60'
                              : 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500/60'
                          }`}>
                            {user.role}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                            user.isActive
                              ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700/60'
                              : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700/60'
                          }`}
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {user.lastLogin ? formatDate(user.lastLogin) : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                            leftIcon={<Edit className="w-4 h-4" />}
                            className="w-28 justify-center hover:text-primary-600 dark:hover:text-primary-400"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleUserStatus(user.id, user.isActive)}
                            leftIcon={
                              user.isActive ? (
                                <XSquare className="w-4 h-4" />
                              ) : (
                                <CheckSquare className="w-4 h-4" />
                              )
                            }
                            className={cn(
                              'w-28 justify-center',
                              user.isActive
                                ? 'hover:text-burgundy-600 dark:hover:text-burgundy-400'
                                : 'hover:text-emerald-600 dark:hover:text-emerald-400',
                            )}
                            disabled={
                              user.id === currentUser?.id ||
                              (user.role === 'admin' && user.isActive && activeAdminCount <= 1)
                            }
                            title={
                              user.role === 'admin' && user.isActive && activeAdminCount <= 1
                                ? 'At least one admin must stay active'
                                : undefined
                            }
                          >
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-8">
        <NameListManager
          apiPath="/responders"
          title="Responders"
          description="Manage the names available in the PCR responder dropdown"
          emptyStateText="No responders yet. Add one to populate the PCR dropdown."
          emptyStateIcon={UsersIcon}
          itemLabel="Responder"
          itemLabelLower="responder"
        />
      </div>

      <div className="mt-8">
        <NameListManager
          apiPath="/psm-members"
          title="Primary PSM"
          description="Manage the names available in the PCR Primary PSM dropdown"
          emptyStateText="No PSM members yet. Add one to populate the PCR dropdown."
          emptyStateIcon={ShieldCheck}
          itemLabel="PSM Member"
          itemLabelLower="PSM member"
          namePlaceholder="e.g. J. Tremblay"
          nameHelpText="Use initial + last name, e.g. J. Tremblay"
        />
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setFormErrors({})
        }}
        title="Create New User"
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={createForm.firstName}
              onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
              error={formErrors.firstName}
              required
            />
            <Input
              label="Last Name"
              value={createForm.lastName}
              onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
              error={formErrors.lastName}
              required
            />
          </div>

          <Input
            label="Username"
            value={createForm.username}
            onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
            error={formErrors.username}
            required
            helpText="Must be at least 3 characters long"
          />

          <Input
            label="Password"
            type="password"
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            error={formErrors.password}
            required
            helpText="At least 8 characters, with a lowercase letter, an uppercase letter, and a number"
          />

          <Input
            label="Confirm Password"
            type="password"
            value={createForm.confirmPassword}
            onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
            error={formErrors.confirmPassword}
            required
          />

          <Select
            label="Role"
            value={createForm.role}
            onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as 'user' | 'admin' })}
            options={[
              { value: 'user', label: 'User' },
              { value: 'admin', label: 'Administrator' },
            ]}
            required
          />

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false)
                setFormErrors({})
              }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              loading={creating}
              disabled={creating}
            >
              Create User
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setEditingUser(null)
          setEditFormErrors({})
        }}
        title={`Edit User: ${editingUser?.username}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={editForm.firstName}
              onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
              error={editFormErrors.firstName}
              required
            />
            <Input
              label="Last Name"
              value={editForm.lastName}
              onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
              error={editFormErrors.lastName}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {editingUser?.id === currentUser?.id ? (
              // Can't deactivate the account you're currently signed in as.
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Status: <span className="font-medium">Active</span> (can't deactivate your own account)
              </div>
            ) : (
              <Select
                label="Status"
                value={editForm.isActive ? 'active' : 'inactive'}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'active' })}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
                required
              />
            )}
          </div>

          <div>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<KeyRound className="w-4 h-4" />}
              onClick={() => editingUser && handleOpenResetPassword(editingUser)}
              className="text-gray-600 hover:text-gray-900 dark:text-gray-300"
            >
              Reset Password
            </Button>
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            {/* Left: Delete */}
            <Button
              variant="ghost"
              className="bg-burgundy-600 text-white border border-burgundy-600 hover:bg-burgundy-700 hover:border-burgundy-700 focus:outline-none focus:ring-2 focus:ring-burgundy-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => editingUser && handleDeleteUser(editingUser.id)}
              disabled={updating || editingUser?.id === currentUser?.id}
            >
              Delete User
            </Button>

            {/* Right: Cancel / Update */}
            <div className="space-x-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowEditModal(false)
                  setEditingUser(null)
                  setEditFormErrors({})
                }}
                disabled={updating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateUser}
                loading={updating}
                disabled={updating}
              >
                Update User
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false)
          setPasswordTarget(null)
          setPasswordFormErrors({})
        }}
        title={`Reset Password: ${passwordTarget?.username}`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Set a new password for this user. They will need to use it the next time they log in.
          </p>

          <Input
            label="New Password"
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            error={passwordFormErrors.newPassword}
            required
            helpText="At least 8 characters, with a lowercase letter, an uppercase letter, and a number"
          />

          <Input
            label="Confirm New Password"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
            error={passwordFormErrors.confirmPassword}
            required
          />

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              variant="secondary"
              onClick={() => {
                setShowPasswordModal(false)
                setPasswordTarget(null)
                setPasswordFormErrors({})
              }}
              disabled={resettingPassword}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              loading={resettingPassword}
              disabled={resettingPassword}
            >
              Reset Password
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default UserManagementPage