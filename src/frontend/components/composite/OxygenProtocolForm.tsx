import React from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const handleFieldChange = (field: keyof OxygenProtocol, value: any) => {
    onChange({ ...data, [field]: value })
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
    { value: 'COPD (88-92%)', label: t('pcr.oxygenProtocol.copd') },
    { value: 'Other (95-100%)', label: t('pcr.oxygenProtocol.otherRange') },
  ]

  const deliveryDeviceOptions = [
    { value: 'Nasal Cannula (NC)', label: t('pcr.oxygenProtocol.nasalCannula') },
    { value: 'Non-Rebreather Mask (NRB)', label: t('pcr.oxygenProtocol.nonRebreatherMask') },
    { value: 'Bag Valve Mask (BVM)', label: t('pcr.oxygenProtocol.bagValveMask') },
  ]

  const whoStartedOptions = [
    { value: 'Protection Services', label: t('pcr.oxygenProtocol.protectionServices') },
    { value: 'VCRT', label: 'VCRT' },
    { value: 'Lifeguard', label: t('pcr.oxygenProtocol.lifeguard') },
    { value: 'Sports Services', label: t('pcr.oxygenProtocol.sportsServices') },
    { value: 'Other', label: t('pcr.oxygenProtocol.other') },
  ]

  return (
    <div className="space-y-6">
      <FormSection title={t('pcr.oxygenProtocol.saturationAssessment')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RadioGroup
            name="saturation_range"
            label={t('pcr.oxygenProtocol.saturationTargetRange')}
            options={saturationOptions}
            value={data.saturation_range}
            onChange={(value) => handleFieldChange('saturation_range', value as 'copd' | 'other')}
            error={errors.saturation_range}
          />

          <Input
            label={t('pcr.oxygenProtocol.initialSpo2')}
            type="text"
            inputMode="numeric"
            value={data.spo2 || ''}
            onChange={(e) => handleFieldChange('spo2', e.target.value)}
            error={errors.spo2}
            placeholder={t('pcr.oxygenProtocol.initialSpo2Placeholder')}
          />
        </div>

        <RadioGroup
          name="spo2_acceptable"
          label={t('pcr.oxygenProtocol.initialSpo2Acceptable')}
          options={[
            { value: 'Yes', label: t('common.yes') },
            { value: 'No', label: t('common.no') },
          ]}
          orientation="horizontal"
          value={data.spo2_acceptable}
          onChange={(value) => handleFieldChange('spo2_acceptable', value as 'Yes' | 'No')}
          error={errors.spo2_acceptable}
        />
      </FormSection>

      <FormSection title={t('pcr.oxygenProtocol.therapyDecision')}>
        <RadioGroup
          name="oxygen_given"
          label={t('pcr.oxygenProtocol.oxygenGiven')}
          options={[
            { value: 'yes', label: t('common.yes') },
            { value: 'no', label: t('common.no') },
          ]}
          orientation="horizontal"
          value={data.oxygen_given}
          onChange={(value) => handleFieldChange('oxygen_given', value as 'yes' | 'no')}
          error={errors.oxygen_given}
        />

        {data.oxygen_given === 'yes' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RadioGroup
              name="whoStartedTherapy"
              label={t('pcr.oxygenProtocol.whoStartedTherapy')}
              options={whoStartedOptions}
              value={data.whoStartedTherapy}
              onChange={(value) => handleFieldChange('whoStartedTherapy', value as 'Protection Services' | 'VCRT' | 'Lifeguard' | 'Sports Services' | 'Other')}
              error={errors.whoStartedTherapy}
            />

            {data.whoStartedTherapy === 'Other' && (
              <Input
                label={t('pcr.oxygenProtocol.otherSpecify')}
                value={data.whoStartedTherapyOther || ''}
                onChange={(e) => handleFieldChange('whoStartedTherapyOther', e.target.value)}
                placeholder={t('pcr.patientInfo.pleaseSpecify')}
              />
            )}
          </div>
        )}

        {data.oxygen_given === 'yes' && (
          <FormSection title={t('pcr.oxygenProtocol.reasonForTherapy')}>
            <Input
              label={t('pcr.oxygenProtocol.reasonForO2Therapy')}
              value={data.reasonForO2Therapy || ''}
              onChange={(e) => handleFieldChange('reasonForO2Therapy', e.target.value)}
              error={errors.reasonForO2Therapy}
              placeholder={t('pcr.oxygenProtocol.reasonForO2TherapyPlaceholder')}
            />
          </FormSection>
        )}

        {data.oxygen_given === 'yes' && (
          <Card>
            <Card.Body>
              <div className="space-y-4">
                <h4 className="font-medium text-gray-500 dark:text-gray-500">
                  {t('pcr.oxygenProtocol.therapyDetails')}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TimePicker
                    label={t('pcr.oxygenProtocol.timeTherapyStarted')}
                    value={data.timeTherapyStarted || ''}
                    onChange={(e) => handleFieldChange('timeTherapyStarted', e.target.value)}
                    error={errors.timeTherapyStarted}
                    required
                  />

                  <TimePicker
                    label={t('pcr.oxygenProtocol.timeTherapyEnded')}
                    value={data.timeTherapyEnded || ''}
                    onChange={(e) => handleFieldChange('timeTherapyEnded', e.target.value)}
                    error={errors.timeTherapyEnded}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label={t('pcr.oxygenProtocol.initialFlowRate')}
                    type="text"
                    inputMode="decimal"
                    value={data.flowRate || ''}
                    onChange={(e) => handleFieldChange('flowRate', e.target.value)}
                    error={errors.flowRate}
                    placeholder={t('pcr.oxygenProtocol.enterValue')}
                  />

                  <RadioGroup
                    name="deliveryDevice"
                    label={t('pcr.oxygenProtocol.deliveryDevice')}
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
          <FormSection title={t('pcr.oxygenProtocol.flowRateAlterations')}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('pcr.oxygenProtocol.recordChanges')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addFlowRateRow}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  {t('pcr.oxygenProtocol.addChange')}
                </Button>
              </div>

              {(data.flowRateAlterations || []).map((alteration, index) => (
                <Card key={index}>
                  <Card.Body>
                    <div className="flex items-end space-x-4">
                      <div className="flex-1">
                        <TimePicker
                          label={t('pcr.oxygenProtocol.timeOfChange')}
                          value={alteration.time || ''}
                          onChange={(e) => handleFlowRateChange(index, 'time', e.target.value)}
                        />
                      </div>

                      <div className="flex-1">
                        <Input
                          label={t('pcr.oxygenProtocol.newFlowRate')}
                          type="text"
                          inputMode="decimal"
                          value={alteration.flowRate || ''}
                          onChange={(e) => handleFlowRateChange(index, 'flowRate', e.target.value)}
                        />
                      </div>

                      <div>
                        {/* Invisible label so the button's own height matches
                            the label+input columns beside it, and centering
                            it (rather than aligning to the row's shared
                            items-end baseline) lines it up with the input box. */}
                        <label className="form-label opacity-0 select-none" aria-hidden="true">&nbsp;</label>
                        <button
                          type="button"
                          onClick={() => removeFlowRateRow(index)}
                          aria-label={t('pcr.oxygenProtocol.removeFlowRateChange')}
                          className="h-10 w-10 flex items-center justify-center rounded text-gray-400 hover:text-burgundy-600 hover:bg-burgundy-50 dark:text-gray-500 dark:hover:text-burgundy-400 dark:hover:bg-burgundy-900/20 focus:outline-none focus:ring-1 focus:ring-burgundy-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              ))}
            </div>
          </FormSection>

          <FormSection title={t('pcr.oxygenProtocol.endOfTherapy')}>
            <div className="space-y-4">
              <Textarea
                label={t('pcr.oxygenProtocol.reasonForEndingTherapy')}
                value={data.reasonForEndingTherapy || ''}
                onChange={(e) => handleFieldChange('reasonForEndingTherapy', e.target.value)}
                error={errors.reasonForEndingTherapy}
                placeholder={t('pcr.oxygenProtocol.reasonForEndingTherapyPlaceholder')}
                rows={3}
              />
            </div>
          </FormSection>
        </>
      )}
    </div>
  )
}

export default OxygenProtocolForm