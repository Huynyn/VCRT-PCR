import React, { useEffect, useState } from 'react'
import { Plus, Edit, Trash2, Users as UsersIcon } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { Input } from '@/components/forms'
import { apiRequest } from '@/utils/api'

interface Responder {
  id: string
  name: string
}

const RespondersManager: React.FC = () => {
  const [responders, setResponders] = useState<Responder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Responder | null>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchResponders = async () => {
    try {
      setLoading(true)
      const res = await apiRequest('/responders')
      setResponders(res.data || [])
    } catch (err) {
      setError('Failed to load responders')
      console.error('Error fetching responders:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResponders()
  }, [])

  const openAdd = () => {
    setEditing(null)
    setName('')
    setNameError('')
    setShowModal(true)
  }

  const openEdit = (r: Responder) => {
    setEditing(r)
    setName(r.name)
    setNameError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Name is required')
      return
    }

    try {
      setSaving(true)
      if (editing) {
        await apiRequest(`/responders/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name }),
        })
      } else {
        await apiRequest('/responders', {
          method: 'POST',
          body: JSON.stringify({ name }),
        })
      }
      await fetchResponders()
      setShowModal(false)
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to save responder')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (r: Responder) => {
    const sure = window.confirm(`Remove "${r.name}" from the responders list?`)
    if (!sure) return

    try {
      await apiRequest(`/responders/${r.id}`, { method: 'DELETE' })
      await fetchResponders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete responder')
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Responders</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Manage the names available in the PCR responder dropdown
            </p>
          </div>
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>
            Add Responder
          </Button>
        </div>
      </div>

      <div className="card-body">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : responders.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <UsersIcon className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-2 text-sm">No responders yet. Add one to populate the PCR dropdown.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {responders.map(r => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-900 dark:text-gray-100">{r.name}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(r)}
                    leftIcon={<Edit className="w-4 h-4" />}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(r)}
                    leftIcon={<Trash2 className="w-4 h-4" />}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Rename Responder' : 'Add Responder'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            error={nameError}
            required
            autoFocus
          />
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={saving}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default RespondersManager
