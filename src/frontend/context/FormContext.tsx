import React, { createContext, useContext, useReducer, useCallback } from 'react'
import { validationRules, isDnoUtoValue } from '@/utils'
import type { FormContextType, PCRFormData } from '@/types'

interface FormState {
  data: Partial<PCRFormData>
  errors: Record<string, string>
  isDirty: boolean
  isValid: boolean
}

type FormAction =
  | { type: 'UPDATE_FIELD'; payload: { field: keyof PCRFormData; value: any } }
  | { type: 'UPDATE_FIELD_SILENT'; payload: { field: keyof PCRFormData; value: any } }
  | { type: 'UPDATE_NESTED_FIELD'; payload: { section: string; field: string; value: any } }
  | { type: 'SET_ERROR'; payload: { field: string; error: string } }
  | { type: 'CLEAR_ERROR'; payload: { field: string } }
  | { type: 'VALIDATE_ALL' }
  | { type: 'RESET' }
  | { type: 'LOAD_DATA'; payload: Partial<PCRFormData> }

const initialState: FormState = {
  data: {
    responders: [''],
    vitalSigns: [{}],
    vitalSigns2: [{}],
    airwayManagement: [],
    hemorrhageControl: [],
    immobilization: [],
    opqrstEntries: [],
    oxygenProtocol: {
      reasonForO2Therapy: [],
    },
  },
  errors: {},
  isDirty: false,
  isValid: false,
}

// Validation rules for PCR form
const HHMM = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/

// Rule messages are stored as i18n keys (translated at the point of display,
// see PCRPage's `errors` memo) rather than literal English text, so the same
// schema drives both languages.
const validationSchema: Record<string, [(value: any) => boolean, string][]> = {
  // Required
  date: [[(v: string) => validationRules.required(v), 'pcr.validation.dateRequired']],
  location: [[(v: string) => validationRules.required(v), 'pcr.validation.locationRequired']],
  callNumber: [[(v: string) => validationRules.required(v), 'pcr.validation.callNumberRequired']],
  reportNumber: [[(v: string) => validationRules.required(v), 'pcr.validation.reportNumberRequired']],
  supervisor: [[(v: string) => validationRules.required(v), 'pcr.validation.supervisorRequired']],
  firstAgencyOnScene: [[(v: string) => validationRules.required(v), 'pcr.validation.firstAgencyOnSceneRequired']],
  patientName: [[(v: string) => validationRules.required(v), 'pcr.validation.patientNameRequired']],
  positionOfPatient: [[(v: string) => validationRules.required(v), 'pcr.validation.positionOfPatientRequired']],
  comments: [[(v: string) => validationRules.required(v), 'pcr.validation.callDescriptionRequired']],
  transferComments: [[(v: string) => validationRules.required(v), 'pcr.validation.transferOfCareRequired']],
  patientCareTransferred: [[(v: string) => validationRules.required(v), 'pcr.validation.patientCareTransferredRequired']],

  // Time fields (required + format) — NO duplicate keys. DNO/UTO (or the
  // French N.O./I.O.) is accepted in place of an actual HH:MM time.
  timeNotified: [
    [(v: string) => validationRules.required(v), 'pcr.validation.timeNotifiedRequired'],
    [(v: string) => HHMM.test(v) || isDnoUtoValue(v), 'pcr.validation.timeFormat'],
  ],
  onScene: [
    [(v: string) => validationRules.required(v), 'pcr.validation.onSceneTimeRequired'],
    [(v: string) => HHMM.test(v) || isDnoUtoValue(v), 'pcr.validation.timeFormat'],
  ],
  clearedScene: [
    [(v: string) => validationRules.required(v), 'pcr.validation.clearedSceneTimeRequired'],
    [(v: string) => HHMM.test(v) || isDnoUtoValue(v), 'pcr.validation.timeFormat'],
  ],
  timeCareTransferred: [
    [(v: string) => validationRules.required(v), 'pcr.validation.timeCareTransferredRequired'],
    [(v: string) => HHMM.test(v) || isDnoUtoValue(v), 'pcr.validation.timeFormat'],
  ],

  // Email (optional, but must be valid if present)
  emergencyContactEmail: [
    [(v: string) => !v || /\S+@\S+\.\S+/.test(v), 'pcr.validation.validEmail'],
  ],

  // Numbers - DNO/UTO (or the French N.O./I.O.) is accepted in place of an
  // actual age.
  age: [[(v: any) => v === '' || v === undefined || isDnoUtoValue(v) || (+v >= 0 && +v <= 150), 'pcr.validation.validAge']],

  // Composite: either age or dob must exist
  ageOrDob: [[
    (form: Partial<PCRFormData>) => {
      const age = form.age?.toString() ?? ''
      const dob = form.dob?.toString() ?? ''
      return age.trim() !== '' || dob.trim() !== ''
    },
    'pcr.validation.ageOrDobRequired',
  ]],
}

const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case 'UPDATE_FIELD':
      return {
        ...state,
        data: {
          ...state.data,
          [action.payload.field]: action.payload.value,
        },
        isDirty: true,
      }
      
    case 'UPDATE_FIELD_SILENT':
      // Same as UPDATE_FIELD but leaves isDirty untouched - for system-driven
      // fills (e.g. auto-populating Call Number) that shouldn't make the form
      // look edited or trigger the "save draft before leaving?" prompt.
      return {
        ...state,
        data: {
          ...state.data,
          [action.payload.field]: action.payload.value,
        },
      }

    case 'UPDATE_NESTED_FIELD':
      return {
        ...state,
        data: {
          ...state.data,
          [action.payload.section]: {
            ...(state.data[action.payload.section as keyof PCRFormData] as any),
            [action.payload.field]: action.payload.value,
          },
        },
        isDirty: true,
      }
      
    case 'SET_ERROR':
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.payload.field]: action.payload.error,
        },
        isValid: Object.keys({
          ...state.errors,
          [action.payload.field]: action.payload.error,
        }).length === 0,
      }
      
    case 'CLEAR_ERROR':
      const newErrors = { ...state.errors }
      delete newErrors[action.payload.field]
      return {
        ...state,
        errors: newErrors,
        isValid: Object.keys(newErrors).length === 0,
      }
      
    case 'VALIDATE_ALL':
      const allErrors: Record<string, string> = {}
      
      Object.entries(validationSchema).forEach(([field, rules]) => {
        const value = field === 'ageOrDob' ? state.data : state.data[field as keyof PCRFormData]

        for (const [rule, message] of rules) {
          if (!rule(value)) {
            allErrors[field] = message
            break
          }
        }
      })
      
      return {
        ...state,
        errors: allErrors,
        isValid: Object.keys(allErrors).length === 0,
      }
      
    case 'RESET':
      return initialState
      
    case 'LOAD_DATA':
      return {
        ...state,
        data: {
          ...initialState.data,
          ...action.payload,
        },
        isDirty: false,
      }
      
    default:
      return state
  }
}

const FormContext = createContext<FormContextType | undefined>(undefined)

interface FormProviderProps {
  children: React.ReactNode
}

export const FormProvider: React.FC<FormProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(formReducer, initialState)

  const updateField = useCallback((field: keyof PCRFormData, value: any) => {
    dispatch({ type: 'UPDATE_FIELD', payload: { field, value } })
    
    // Clear error for this field if it exists
    if (state.errors[field]) {
      dispatch({ type: 'CLEAR_ERROR', payload: { field } })
    }
  }, [state.errors])

  const updateFieldSilently = useCallback((field: keyof PCRFormData, value: any) => {
    dispatch({ type: 'UPDATE_FIELD_SILENT', payload: { field, value } })
  }, [])

  const updateNestedField = useCallback((section: string, field: string, value: any) => {
    dispatch({ type: 'UPDATE_NESTED_FIELD', payload: { section, field, value } })
  }, [])

  const validateField = useCallback((field: string): boolean => {
    const rules = validationSchema[field]
    if (!rules) return true

    const value = field === 'ageOrDob' ? state.data : state.data[field as keyof PCRFormData]

    for (const [rule, message] of rules) {
      if (!rule(value)) {
        dispatch({ type: 'SET_ERROR', payload: { field, error: message } })
        return false
      }
    }

    dispatch({ type: 'CLEAR_ERROR', payload: { field } })
    return true
  }, [state.data])

  const validateAll = useCallback((): Record<string, string> => {
    dispatch({ type: 'VALIDATE_ALL' })

    // Compute errors here too so we can return them synchronously
    const allErrors: Record<string, string> = {}
    Object.entries(validationSchema).forEach(([field, rules]) => {
      const value = field === 'ageOrDob' ? state.data : state.data[field as keyof PCRFormData]
      for (const [rule, message] of rules) {
        if (!rule(value)) {
          allErrors[field] = message
          break
        }
      }
    })
    return allErrors
  }, [state.data])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  const loadData = useCallback((data: Partial<PCRFormData>) => {
    dispatch({ type: 'LOAD_DATA', payload: data })
  }, [])

  const contextValue: FormContextType = {
    data: state.data,
    updateField,
    updateFieldSilently,
    updateNestedField,
    errors: state.errors,
    isDirty: state.isDirty,
    isValid: state.isValid,
    reset,
    validateField,
    validateAll,
    loadData,
  }

  return (
    <FormContext.Provider value={contextValue}>
      {children}
    </FormContext.Provider>
  )
}

export const useForm = (): FormContextType => {
  const context = useContext(FormContext)
  if (!context) {
    throw new Error('useForm must be used within a FormProvider')
  }
  return context
}
