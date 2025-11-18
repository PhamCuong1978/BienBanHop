
import React from 'react';

export interface ProcessingOptions {
    convertToMono16kHz: boolean;
    noiseReduction: boolean;
    normalizeVolume: boolean;
    removeSilence: boolean;
}

interface OptionsProps {
    disabled: boolean;
    options: ProcessingOptions;
    onOptionChange: (newOptions: ProcessingOptions) => void;
}

const OptionCheckbox: React.FC<{ label: string; disabled: boolean; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, disabled, checked, onChange }) => (
    <label className={`flex items-center space-x-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
        <input 
            type="checkbox"
            className="form-checkbox h-4 w-4 bg-gray-600 border-gray-500 rounded text-cyan-500 focus:ring-cyan-500"
            disabled={disabled}
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-gray-300 text-sm">{label}</span>
    </label>
);


const Options: React.FC<OptionsProps> = ({ disabled, options, onOptionChange }) => {
    
    const handleOptionChange = (option: keyof ProcessingOptions, value: boolean) => {
        onOptionChange({ ...options, [option]: value });
    };

    return (
        <div className="space-y-3 p-4 bg-gray-700/50 rounded-lg h-full">
            <p className="text-xs text-gray-400 mb-2">Note: These options can improve accuracy but may increase processing time.</p>
            <OptionCheckbox label="Convert to mono & 16kHz" disabled={disabled} checked={options.convertToMono16kHz} onChange={v => handleOptionChange('convertToMono16kHz', v)} />
            <OptionCheckbox label="Apply noise reduction" disabled={disabled} checked={options.noiseReduction} onChange={v => handleOptionChange('noiseReduction', v)} />
            <OptionCheckbox label="Normalize volume" disabled={disabled} checked={options.normalizeVolume} onChange={v => handleOptionChange('normalizeVolume', v)} />
            <OptionCheckbox label="Remove silence" disabled={disabled} checked={options.removeSilence} onChange={v => handleOptionChange('removeSilence', v)} />
        </div>
    );
};

export default Options;
