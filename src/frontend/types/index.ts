// Form Data Types
export interface BasicInformation {
  date: string;
  location: string;
  callNumber: string;
  reportNumber: string;
  responder1?: string;
  responder2?: string;
  responder3?: string;
  supervisor: string;
  primaryPSM?: string;
  timeNotified: string;
  onScene: string;
  transportArrived?: string;
  clearedScene: string;
  paramedicsCalledBy?: string;
  firstAgencyOnScene: string;
}

export interface PatientInformation {
  patientName: string;
  dob?: string;
  age?: string;
  sex?: 'Male' | 'Female' | 'Different from gender' | 'Does not want to disclose' | 'Other';
  otherSex?: string;
  status?: 'Student' | 'Employee' | 'Visitor/Other';
  visitorText?: string;
  workplaceInjury?: 'Yes' | 'No';
  studentEmployeeNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  contacted?: 'Yes' | 'No';
  contactedBy?: string;
}

export interface MedicalHistory {
  chiefComplaint?: string;
  signsSymptoms?: string;
  allergies?: string;
  medications?: string;
  medicalHistory?: string;
  lastMeal?: string;
  bodySurvey?: string;
}

export interface TreatmentPerformed {
  airwayManagement?: string[];
  airwayManagementOther?: string;
  cprAedPerformed?: boolean;
  cprPerformed?: boolean;
  aedPerformed?: boolean;
  timeStarted?: string;
  numberOfCycles?: string;
  numberOfShocks?: string;
  shockNotAdvised?: string;
  hemorrhageControl?: string[];
  timeApplied?: string;
  numberOfTurns?: string;
  immobilization?: string[];
  positionOfPatient: string;
}

export interface OPQRSTAssessment {
  onset?: string;
  provocation?: string;
  quality?: string;
  radiation?: string;
  scale?: number;
  time?: string;
}

export interface VitalSign {
  time?: string;
  pulse?: string;
  resp?: string;
  spo2?: string;
  bp?: string;
  loc?: string;
  skin?: string;
}

export interface VitalSigns2 {
  time?: string;
  spo2?: string;
}

export interface OxygenProtocol {
  saturation_range?: 'copd' | 'other';
  spo2?: string;
  spo2_acceptable?: 'yes' | 'no';
  oxygen_given?: 'yes' | 'no';
  o2_supervisor?: string;
  o2_responder1?: string;
  o2_responder2?: string;
  o2_responder3?: string;
  reasonForO2Therapy?: string[];
  reasonForO2TherapyOther?: string;
  timeTherapyStarted?: string;
  timeTherapyEnded?: string;
  flowRate?: string;
  deliveryDevice?: 'NC' | 'NRB' | 'BVM';
  flowRateAlterations?: Array<{ time?: string; flowRate?: string }>;
  reasonForEndingTherapy?: string;
  whoStartedTherapy?: 'Protection' | 'VCRT' | 'Lifeguard' | 'Sports Services';
}

export interface AdditionalInformation {
  comments: string;
  transferComments: string;
  hospitalDestination: string;
  patientCareTransferred: 'Paramedics' | 'Police' | 'Self' | 'Family/Friend' | 'Clinic';
  unitNumber?: string;
  timeCareTransferred: string;
}

export interface PCRFormData extends BasicInformation, PatientInformation, MedicalHistory, TreatmentPerformed, OPQRSTAssessment, AdditionalInformation {
  injuryCanvas?: string;
  vitalSigns: VitalSign[];
  vitalSigns2: VitalSigns2[];
  oxygenProtocol?: OxygenProtocol;
}

// User Management Types
export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user' | 'supervisor';
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

// UI Component Types
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  label?: string;
  error?: string;
  helpText?: string;
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

export interface FormSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  isCollapsible?: boolean;
  defaultOpen?: boolean;
  required?: boolean;
}

// Notification Types
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationContextType {
  showNotification: (message: string, type: NotificationType) => void;
}

// Form Context Types
export interface FormContextType {
  data: Partial<PCRFormData>;
  updateField: (field: keyof PCRFormData, value: any) => void;
  updateNestedField: (section: string, field: string, value: any) => void;
  errors: Record<string, string>;
  isDirty: boolean;
  isValid: boolean;
  reset: () => void;
  validateField: (field: string) => boolean;
  validateAll: () => Record<string, string>;
  loadData: (data: Partial<PCRFormData>) => void;
}