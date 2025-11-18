
import React from 'react';

interface ModelSelectorProps {
    onModelChange: (model: string) => void;
    disabled: boolean;
    initialModel: string;
}

const models = [
    { id: 'gemini-2.5-flash', name: 'Flash (Fast & Efficient)' },
    { id: 'gemini-2.5-pro', name: 'Pro (Highest Quality)' },
];

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange, disabled, initialModel }) => {
    return (
        <div className="p-4 bg-gray-700/50 rounded-lg">
            <label htmlFor="model-select" className="block text-sm font-medium text-gray-300 mb-2">
                Choose the AI model. "Pro" offers higher accuracy but may be slower.
            </label>
            <select
                id="model-select"
                value={initialModel}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={disabled}
                className="w-full bg-gray-600 border border-gray-500 text-white rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500"
            >
                {models.map(model => (
                    <option key={model.id} value={model.id}>
                        {model.name}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default ModelSelector;
