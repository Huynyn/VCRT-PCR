import React, { useEffect, useState } from 'react'
import { Plus, Edit, Trash2, LucideIcon } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { Input } from '@/components/forms'
import { apiRequest } from '@/utils/api'

interface NamedItem {
  id: string
  name: string
}

interface NameListManagerProps {
  /** API base path, e.g. '/responders' or '/psm-members' */
  apiPath: string
  title: string
  description: string
  emptyStateText: string
  emptyStateIcon: LucideIcon
  /** Capitalized noun for the add button and modal titles, e.g. "Responder" */
  itemLabel: string
  /** Lowercase noun for inline copy, e.g. "responder" or "PSM member" */
  itemLabelLower: string
  namePlaceholder?: string
  nameHelpText?: string
}

const NameListManager: React.FC<NameListManagerProps> = ({
  apiPath,
  title,
  description,
  emptyStateText,
  emptyStateIcon: EmptyIcon,
  itemLabel,
  itemLabelLower,
  namePlaceholder,
  nameHelpText,
}) => {
  const [items, setItems] = useState<NamedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<NamedItem | null>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchItems = async () => {
    try {
      setLoading(true)
      const res = await apiRequest(apiPath)
      setItems(res.data || [])
    } catch (err) {
      setError(`Failed to load ${itemLabelLower}s`)
      console.error(`Error fetching ${itemLabelLower}s:`, err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPath])

  const openAdd = () => {
    setEditing(null)
    setName('')
    setNameError('')
    setShowModal(true)
  }

  const openEdit = (item: NamedItem) => {
    setEditing(item)
    setName(item.name)
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
        await apiRequest(`${apiPath}/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name }),
        })
      } else {
        await apiRequest(apiPath, {
          method: 'POST',
          body: JSON.stringify({ name }),
        })
      }
      await fetchItems()
      setShowModal(false)
    } catch (err) {
      setNameError(err instanceof Error ? err.message : `Failed to save ${itemLabelLower}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: NamedItem) => {
    const sure = window.confirm(`Remove "${item.name}" from the ${itemLabelLower} list?`)
    if (!sure) return

    try {
      await apiRequest(`${apiPath}/${item.id}`, { method: 'DELETE' })
      await fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to delete ${itemLabelLower}`)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
          </div>
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>
            Add {itemLabel}
          </Button>
        </div>
      </div>

      <div className="card-body">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <EmptyIcon className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-2 text-sm">{emptyStateText}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {items.map(item => (
              <li key={item.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-900 dark:text-gray-100">{item.name}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(item)}
                    leftIcon={<Edit className="w-4 h-4" />}
                    className="w-28 justify-center hover:text-primary-600 dark:hover:text-primary-400"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(item)}
                    leftIcon={<Trash2 className="w-4 h-4" />}
                    className="w-28 justify-center hover:text-burgundy-600 dark:hover:text-burgundy-400"
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
        title={editing ? `Rename ${itemLabel}` : `Add ${itemLabel}`}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            error={nameError}
            placeholder={namePlaceholder}
            helpText={nameHelpText}
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

export default NameListManager
