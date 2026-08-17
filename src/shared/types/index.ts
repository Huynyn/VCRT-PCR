// Common types used across frontend and backend


export interface PCRReport {
  id?: string
  incidentNumber: string
  date: string
  time: string
  location: string
  chiefComplaint: string
  presentIllness: string
  assessment: Assessment
  treatment: Treatment[]
  vitals: VitalSigns[]
  medications: MedicationAdministered[]
  procedures: Procedure[]
  transport: Transport
  disposition: string
  signature: string
  createdBy: string
  createdAt?: string
  updatedAt?: string
  status: 'draft' | 'completed' | 'submitted' | 'approved' | 'changes_requested' | 'cancelled'
  adminComments?: string | null
}

export interface Assessment {
  primary: string
  secondary?: string
  impressions: string[]
  priority: 'low' | 'medium' | 'high' | 'critical'
}

export interface Treatment {
  id: string
  time: string
  intervention: string
  response: string
  performedBy: string
}

export interface VitalSigns {
  time: string
  bloodPressure: {
    systolic: number
    diastolic: number
  }
  heartRate: number
  respiratoryRate: number
  temperature: number
  oxygenSaturation: number
  painScale?: number
  glucoseLevel?: number
  notes?: string
}

export interface MedicationAdministered {
  name: string
  dosage: string
  route: string
  time: string
  administeredBy: string
  indication: string
}

export interface Procedure {
  name: string
  time: string
  outcome: string
  performedBy: string
  complications?: string
}

export interface Transport {
  mode: 'ambulance' | 'helicopter' | 'walk-in' | 'other'
  destination: string
  departureTime: string
  arrivalTime: string
  condition: 'stable' | 'unstable' | 'critical'
  monitoring: string[]
}

export interface User {
  id: string
  username: string
  firstName: string
  lastName: string
  email: string
  role: 'admin' | 'user'
  licenseNumber: string
  department: string
  isActive: boolean
  lastLogin?: string
  createdAt: string
  updatedAt: string
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface AuthResponse {
  user: User
  token: string
  expiresIn: number
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface PaginationParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  items: T[]
  totalCount: number
  page: number
  limit: number
  totalPages: number
}

export interface ActivityLog {
  id: string
  user_id: string
  username?: string
  first_name?: string
  last_name?: string
  action: string
  resource_type?: string
  resource_id?: string
  details?: string
  ip_address?: string
  user_agent?: string
  created_at: string
}

// Form validation types
export interface ValidationError {
  field: string
  message: string
}

export interface FormErrors {
  [key: string]: string[]
}