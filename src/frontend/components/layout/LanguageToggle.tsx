import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Tooltip } from '@/components/ui'
import { LANGUAGE_STORAGE_KEY } from '@/i18n'

const LanguageToggle: React.FC = () => {
  const { t, i18n } = useTranslation()
  const isFrench = i18n.language === 'fr'

  const toggleLanguage = () => {
    const next = isFrench ? 'en' : 'fr'
    i18n.changeLanguage(next)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
  }

  return (
    <Tooltip content={isFrench ? t('header.switchToEnglish') : t('header.switchToFrench')}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggleLanguage}
        className="text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-xs font-semibold"
        aria-label={isFrench ? t('header.switchToEnglish') : t('header.switchToFrench')}
      >
        {isFrench ? 'EN' : 'FR'}
      </Button>
    </Tooltip>
  )
}

export default LanguageToggle
