import React from 'react'
import { Input, Select, RadioGroup, Checkbox, TimePicker, Textarea } from '@/components/forms'
import { FormSection } from '@/components/forms'
import { Card, Button } from '@/components/ui'
import { Plus, Trash2 } from 'lucide-react'
import type { OxygenProtocol } from '@/types'

interface OxygenProtocolFormProps {
  data: OxygenProtocol
  onChange: (data: Partial<OxygenProtocol>) => void
  errors?: Record<string, string>
}

const OxygenProtocolForm: React.FC<OxygenProtocolFormProps> = ({
  data,
  onChange,
  errors = {},
}) => {
  const handleFieldChange = (field: keyof OxygenProtocol, value: any) => {
    onChange({ ...data, [field]: value })
  }

  const handleReasonChange = (reasons: string[]) => {
    onChange({ ...data, reasonForO2Therapy: reasons })
  }

  const handleFlowRateChange = (index: number, field: 'time' | 'flowRate', value: string) => {
    const alterations = data.flowRateAlterations || []
    const newAlterations = [...alterations]
    
    if (!newAlterations[index]) {
      newAlterations[index] = {}
    }
    
    newAlterations[index] = { ...newAlterations[index], [field]: value }
    onChange({ ...data, flowRateAlterations: newAlterations })
  }

  const addFlowRateRow = () => {
    const alterations = data.flowRateAlterations || []
    onChange({ 
      ...data, 
      flowRateAlterations: [...alterations, { time: '', flowRate: '' }] 
    })
  }

  const removeFlowRateRow = (index: number) => {
    const alterations = data.flowRateAlterations || []
    const newAlterations = alterations.filter((_, i) => i !== index)
    onChange({ ...data, flowRateAlterations: newAlterations })
  }

  const saturationOptions = [
    { value: 'COPD (88-92%)', label: 'COPD (88-92%)' },
    { value: 'Other (95-100%)', label: 'Other (95-100%)' },
  ]

  const deliveryDeviceOptions = [
    { value: 'Nasal Cannula (NC)', label: 'Nasal Cannula (NC)' },
    { value: 'Non-Rebreather Mask (NRB)', label: 'Non-Rebreather Mask (NRB)' },
    { value: 'Bag Valve Mask (BVM)', label: 'Bag Valve Mask (BVM)' },
  ]

  const whoStartedOptions = [
    { value: 'Protection Services', label: 'Protection Services' },
    { value: 'VCRT', label: 'VCRT' },
    { value: 'Lifeguard', label: 'Lifeguard' },
    { value: 'Sports Services', label: 'Sports Services' },
    { value: 'Other', label: 'Other' },
  ]

  return (
    <div className="space-y-6">
      <FormSection title="Oxygen Saturation Assessment">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RadioGroup
            name="saturation_range"
            label="Saturation Target Range"
            options={saturationOptions}
            value={data.saturation_range}
            onChange={(value) => handleFieldChange('saturation_range', value as 'copd' | 'other')}
            error={errors.saturation_range}
          />
          
          <Input
            label="Initial SpO₂ %"
            type="number"
            min="0"
            max="100"
            value={data.spo2 || ''}
            onChange={(e) => handleFieldChange('spo2', e.target.value)}
            error={errors.spo2}
            placeholder="Enter value (0-100)"
          />
        </div>
        
        <RadioGroup
          name="spo2_acceptable"
          label="Initial SpO₂ Acceptable?"
          options={[
            { value: 'Yes', label: 'Yes' },
            { value: 'No', label: 'No' },
          ]}
          orientation="horizontal"
          value={data.spo2_acceptable}
          onChange={(value) => handleFieldChange('spo2_acceptable', value as 'Yes' | 'No')}
          error={errors.spo2_acceptable}
        />
      </FormSection>

      <FormSection title="Oxygen Therapy Decision">
        <RadioGroup
          name="oxygen_given"
          label="Oxygen Therapy Given?"
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          orientation="horizontal"
          value={data.oxygen_given}
          onChange={(value) => handleFieldChange('oxygen_given', value as 'yes' | 'no')}
          error={errors.oxygen_given}
        />
        
        {data.oxygen_given === 'yes' && (
          <FormSection title="Reason for Oxygen Therapy">
            <Input
              label="Reason for O2 Therapy"
              value={data.reasonForO2Therapy || []}
              onChange={(e) => handleFieldChange('reasonForO2Therapy', e.target.value)}
              error={errors.reasonForO2Therapy}
              placeholder="e.g., hypoxaemia, shock, anaphylaxis, drowning, ventilation during CPR..."
            />
          </FormSection>
        )}

        {data.oxygen_given === 'yes' && (
          <Card>
            <Card.Body>
              <div className="space-y-4">
                <h4 className="font-medium text-gray-500 dark:text-gray-500">
                  Therapy Details
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TimePicker
                    label="Time Therapy Started"
                    value={data.timeTherapyStarted || ''}
                    onChange={(e) => handleFieldChange('timeTherapyStarted', e.target.value)}
                    error={errors.timeTherapyStarted}
                    required
                  />

                  <TimePicker
                    label="Time Therapy Ended"
                    value={data.timeTherapyEnded || ''}
                    onChange={(e) => handleFieldChange('timeTherapyEnded', e.target.value)}
                    error={errors.timeTherapyEnded}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Initial Flow Rate (L/min)"
                    type="number"
                    min="0"
                    max="15"
                    value={data.flowRate || ''}
                    onChange={(e) => handleFieldChange('flowRate', e.target.value)}
                    error={errors.flowRate}
                    placeholder="Enter value"
                  />

                  <RadioGroup
                    name="deliveryDevice"
                    label="Delivery Device"
                    options={deliveryDeviceOptions}
                    value={data.deliveryDevice}
                    onChange={(value) => handleFieldChange('deliveryDevice', value as 'NC' | 'NRB' | 'BVM')}
                    error={errors.deliveryDevice}
                  />
                </div>
              </div>
            </Card.Body>
          </Card>
        )}
      </FormSection>

      {data.oxygen_given === 'yes' && (
        <>
          <FormSection title="Flow Rate Alterations">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Record any changes to the oxygen flow rate during therapy
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addFlowRateRow}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  Add Change
                </Button>
              </div>

              {(data.flowRateAlterations || []).map((alteration, index) => (
                <Card key={index}>
                  <Card.Body>
                    <div className="flex items-end space-x-4">
                      <div className="flex-1">
                        <TimePicker
                          label="Time of Change"
                          value={alteration.time || ''}
                          onChange={(e) => handleFlowRateChange(index, 'time', e.target.value)}
                        />
                      </div>
                      
                      <div className="flex-1">
                        <Input
                          label="New Flow Rate (L/min)"
                          type="number"
                          min="0"
                          max="15"
                          value={alteration.flowRate || ''}
                          onChange={(e) => handleFlowRateChange(index, 'flowRate', e.target.value)}
                        />
                      </div>
                      
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeFlowRateRow(index)}
                        className="text-emergency-500 hover:text-emergency-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card.Body>
                </Card>
              ))}
            </div>
          </FormSection>

          <FormSection title="End of Therapy">
            <div className="space-y-4">
              <Textarea
                label="Reason for Ending Therapy"
                value={data.reasonForEndingTherapy || ''}
                onChange={(e) => handleFieldChange('reasonForEndingTherapy', e.target.value)}
                error={errors.reasonForEndingTherapy}
                placeholder="Describe why oxygen therapy was discontinued..."
                rows={3}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RadioGroup
                  name="whoStartedTherapy"
                  label="Who Started Therapy"
                  options={whoStartedOptions}
                  value={data.whoStartedTherapy}
                  onChange={(value) => handleFieldChange('whoStartedTherapy', value as 'Protection Services' | 'VCRT' | 'Lifeguard' | 'Sports Services' | 'Other')}
                  error={errors.whoStartedTherapy}
                />

                {data.whoStartedTherapy === 'Other' && (
                  <Input
                    label="Other (specify)"
                    value={data.whoStartedTherapyOther || ''}
                    onChange={(e) => handleFieldChange('whoStartedTherapyOther', e.target.value)}
                    placeholder="Please specify"
                  />
                )}
              </div>
            </div>
          </FormSection>
        </>
      )}
    </div>
  )
}

export default OxygenProtocolForm