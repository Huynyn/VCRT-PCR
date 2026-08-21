import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

interface ProfileChangeRequest {
  id: string
  user_id: string
  message: string
  created_at: string
}

const UserManagementPage = () => {
  const { t, i18n } = useTranslation()
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
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [passwordFormErrors, setPasswordFormErrors] = useState<Partial<PasswordForm>>({})

  // Pending name/password change requests from users, shown at the top of
  // the Edit User modal for whichever user submitted one.
  const [pendingRequests, setPendingRequests] = useState<ProfileChangeRequest[]>([])

  const pendingRequestByUserId = useMemo(() => {
    const map = new Map<string, ProfileChangeRequest>()
    pendingRequests.forEach(r => map.set(r.user_id, r))
    return map
  }, [pendingRequests])

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
      setError(t('userManagement.accessDeniedMessage'))
      setLoading(false)
      return
    }
    fetchUsers()
    fetchPendingRequests()
  }, [currentUser])

  const fetchUsers = async () => {
    try {
      setLoading(true)

      if (!isAuthenticated || !token) {
        setError(t('userManagement.loginToView'))
        setLoading(false)
        return
      }

      const data = await apiRequest('/users')
      setUsers(data.data || [])
    } catch (err) {
      setError(t('userManagement.loadFailed'))
      console.error('Error fetching users:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingRequests = async () => {
    try {
      const data = await apiRequest('/profile-requests')
      setPendingRequests(data.data || [])
    } catch {
      // Non-critical - the banner just won't show if this fails
    }
  }

  const handleDismissRequest = async (requestId: string) => {
    try {
      await apiRequest(`/profile-requests/${requestId}/resolve`, { method: 'PUT' })
      setPendingRequests(prev => prev.filter(r => r.id !== requestId))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userManagement.dismissRequestFailed'))
      console.error('Error dismissing request:', err)
    }
  }

  const validateForm = (): boolean => {
    const errors: Partial<CreateUserForm> = {}

    if (!createForm.username.trim()) {
      errors.username = t('userManagement.usernameRequired')
    } else if (createForm.username.length < 3) {
      errors.username = t('userManagement.usernameMinLength')
    }

    if (!createForm.password.trim()) {
      errors.password = t('userManagement.passwordRequired')
    } else {
      const passwordError = getPasswordStrengthError(createForm.password, t)
      if (passwordError) errors.password = passwordError
    }

    if (!createForm.confirmPassword.trim()) {
      errors.confirmPassword = t('userManagement.confirmPasswordRequired')
    } else if (createForm.password !== createForm.confirmPassword) {
      errors.confirmPassword = t('userManagement.passwordsDontMatch')
    }

    if (!createForm.firstName.trim()) {
      errors.firstName = t('userManagement.firstNameRequired')
    }

    if (!createForm.lastName.trim()) {
      errors.lastName = t('userManagement.lastNameRequired')
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
      setError(err instanceof Error ? err.message : t('userManagement.createUserFailed'))
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
      setError(err instanceof Error ? err.message : t('userManagement.updateStatusFailed'))
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
      setError(t('userManagement.cantDeleteOwnAccount'))
      return
    }

    const sure = window.confirm(t('userManagement.deleteUserConfirm'))
    if (!sure) return

    try {
      await apiRequest(`/users/${userId}`, {
        method: 'DELETE',
      })

      setShowEditModal(false)
      setEditingUser(null)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userManagement.deleteUserFailed'))
      console.error('Error deleting user:', err)
    }
  }

  const validateEditForm = (): boolean => {
    const errors: Partial<EditUserForm> = {}

    if (!editForm.firstName.trim()) {
      errors.firstName = t('userManagement.firstNameRequired')
    }

    if (!editForm.lastName.trim()) {
      errors.lastName = t('userManagement.lastNameRequired')
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
      setError(err instanceof Error ? err.message : t('userManagement.updateUserFailed'))
      console.error('Error updating user:', err)
    } finally {
      setUpdating(false)
    }
  }

  const handleOpenResetPassword = (user: User) => {
    setShowEditModal(false)
    setPasswordTarget(user)
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setPasswordFormErrors({})
    setShowPasswordModal(true)
  }

  // Resetting your own password (even as an admin) requires confirming the
  // current one - only resetting someone else's account skips that.
  const isResettingOwnPassword = passwordTarget?.id === currentUser?.id

  const validatePasswordForm = (): boolean => {
    const errors: Partial<PasswordForm> = {}

    if (isResettingOwnPassword && !passwordForm.currentPassword.trim()) {
      errors.currentPassword = t('userManagement.currentPasswordRequired')
    }

    if (!passwordForm.newPassword.trim()) {
      errors.newPassword = t('userManagement.newPasswordRequired')
    } else {
      const passwordError = getPasswordStrengthError(passwordForm.newPassword, t)
      if (passwordError) errors.newPassword = passwordError
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = t('userManagement.passwordsDontMatch')
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
        body: JSON.stringify({
          newPassword: passwordForm.newPassword,
          ...(isResettingOwnPassword ? { currentPassword: passwordForm.currentPassword } : {}),
        }),
      })

      setShowPasswordModal(false)
      setPasswordTarget(null)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordFormErrors({})
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userManagement.resetPasswordFailed'))
      console.error('Error resetting password:', err)
    } finally {
      setResettingPassword(false)
    }
  }

  const formatDate = (dateString: string) => {
    return parseServerDate(dateString).toLocaleDateString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', {
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
          <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">{t('userManagement.accessDenied')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('userManagement.accessDeniedBody')}
          </p>
        </div>
      </div>
    )
  }

  const editingUserRequest = editingUser ? pendingRequestByUserId.get(editingUser.id) : undefined

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('userManagement.title')}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {t('userManagement.subtitle')}
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('userManagement.title')}</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('userManagement.subtitle')}
            </p>
          </div>
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            {t('userManagement.createUser')}
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
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{t('userManagement.noUsersFound')}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('userManagement.getStarted')}
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
                  {t('common.scrollHorizontally')}
                </div>
              )}
              <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-700 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[200px]">
                      {t('userManagement.columnUser')}
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[120px]">
                      {t('userManagement.columnRole')}
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[100px]">
                      {t('userManagement.columnStatus')}
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[160px]">
                      {t('userManagement.columnCreated')}
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[160px] whitespace-nowrap">
                      {t('userManagement.columnLastLogin')}
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[180px]">
                      {t('userManagement.columnActions')}
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
                            {t(`common.role.${user.role}`, user.role)}
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
                          {user.isActive ? t('userManagement.active') : t('userManagement.inactive')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {user.lastLogin ? formatDate(user.lastLogin) : t('userManagement.never')}
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
                            {t('userManagement.edit')}
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
                                ? t('userManagement.atLeastOneAdmin')
                                : undefined
                            }
                          >
                            {user.isActive ? t('userManagement.deactivate') : t('userManagement.activate')}
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
          title={t('userManagement.respondersTitle')}
          description={t('userManagement.respondersDescription')}
          emptyStateText={t('userManagement.respondersEmptyText')}
          emptyStateIcon={UsersIcon}
          itemLabel={t('userManagement.responderItemLabel')}
          itemLabelLower={t('userManagement.responderItemLabelLower')}
        />
      </div>

      <div className="mt-8">
        <NameListManager
          apiPath="/psm-members"
          title={t('userManagement.psmTitle')}
          description={t('userManagement.psmDescription')}
          emptyStateText={t('userManagement.psmEmptyText')}
          emptyStateIcon={ShieldCheck}
          itemLabel={t('userManagement.psmItemLabel')}
          itemLabelLower={t('userManagement.psmItemLabelLower')}
          namePlaceholder={t('userManagement.psmNamePlaceholder')}
          nameHelpText={t('userManagement.psmNameHelpText')}
        />
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setFormErrors({})
        }}
        title={t('userManagement.createUserTitle')}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('userManagement.firstName')}
              value={createForm.firstName}
              onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
              error={formErrors.firstName}
              required
            />
            <Input
              label={t('userManagement.lastName')}
              value={createForm.lastName}
              onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
              error={formErrors.lastName}
              required
            />
          </div>

          <Input
            label={t('userManagement.username')}
            value={createForm.username}
            onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
            error={formErrors.username}
            required
            helpText={t('userManagement.usernameHelp')}
          />

          <Input
            label={t('userManagement.password')}
            type="password"
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            error={formErrors.password}
            required
            helpText={t('userManagement.passwordHelp')}
          />

          <Input
            label={t('userManagement.confirmPassword')}
            type="password"
            value={createForm.confirmPassword}
            onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
            error={formErrors.confirmPassword}
            required
          />

          <Select
            label={t('userManagement.role')}
            value={createForm.role}
            onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as 'user' | 'admin' })}
            options={[
              { value: 'user', label: t('userManagement.roleUser') },
              { value: 'admin', label: t('userManagement.roleAdmin') },
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
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateUser}
              loading={creating}
              disabled={creating}
            >
              {t('userManagement.createUser')}
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
        title={t('userManagement.editUserTitle', { username: editingUser?.username })}
        size="md"
      >
        <div className="space-y-4">
          {editingUserRequest && (
            <Alert
              type="info"
              title={t('userManagement.pendingRequestTitle')}
              message={editingUserRequest.message}
              dismissible
              onDismiss={() => handleDismissRequest(editingUserRequest.id)}
            >
              <p className="text-xs opacity-75">
                {t('userManagement.pendingRequestSentOn', { date: formatDate(editingUserRequest.created_at) })}
              </p>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('userManagement.firstName')}
              value={editForm.firstName}
              onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
              error={editFormErrors.firstName}
              required
            />
            <Input
              label={t('userManagement.lastName')}
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
                {t('userManagement.statusActiveOwnAccount', { status: t('userManagement.active') })}
              </div>
            ) : (
              <Select
                label={t('userManagement.columnStatus')}
                value={editForm.isActive ? 'active' : 'inactive'}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'active' })}
                options={[
                  { value: 'active', label: t('userManagement.active') },
                  { value: 'inactive', label: t('userManagement.inactive') },
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
              {t('userManagement.resetPassword')}
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
              {t('userManagement.deleteUser')}
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
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleUpdateUser}
                loading={updating}
                disabled={updating}
              >
                {t('userManagement.updateUser')}
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
        title={t('userManagement.resetPasswordTitle', { username: passwordTarget?.username })}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isResettingOwnPassword ? t('userManagement.resetOwnPasswordBody') : t('userManagement.resetPasswordBody')}
          </p>

          {isResettingOwnPassword && (
            <Input
              label={t('userManagement.currentPassword')}
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              error={passwordFormErrors.currentPassword}
              required
            />
          )}

          <Input
            label={t('userManagement.newPassword')}
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            error={passwordFormErrors.newPassword}
            required
            helpText={t('userManagement.passwordHelp')}
          />

          <Input
            label={t('userManagement.confirmNewPassword')}
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
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleResetPassword}
              loading={resettingPassword}
              disabled={resettingPassword}
            >
              {t('userManagement.resetPassword')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default UserManagementPage