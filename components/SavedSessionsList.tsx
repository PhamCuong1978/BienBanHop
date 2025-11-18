
import React from 'react';
import { SavedSession } from '../App';
import { TrashIcon } from './icons';

interface SavedSessionsListProps {
    sessions: SavedSession[];
    onLoad: (sessionId: string) => void;
    onDelete: (sessionId: string) => void;
    disabled: boolean;
}

const SavedSessionsList: React.FC<SavedSessionsListProps> = ({ sessions, onLoad, onDelete, disabled }) => {
    if (sessions.length === 0) {
        return (
            <div className="text-center p-8 bg-gray-700/50 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-300">Không có biên bản nào được lưu</h3>
                <p className="text-gray-400 mt-2">Sau khi bạn tạo một biên bản, nó sẽ xuất hiện ở đây.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {sessions.map(session => (
                <div key={session.id} className="bg-gray-700/80 p-4 rounded-lg border border-gray-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex-grow min-w-0">
                        <h4 className="font-bold text-white truncate" title={session.name}>{session.name}</h4>
                        <p className="text-xs text-gray-400">
                            Lưu lúc: {new Date(session.createdAt).toLocaleString()}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                         <button
                            onClick={() => onLoad(session.id)}
                            disabled={disabled}
                            className="w-full sm:w-auto flex-1 sm:flex-initial px-4 py-2 text-sm bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 disabled:bg-gray-500 transition-colors"
                        >
                            Tải lại
                        </button>
                         <button
                            onClick={() => onDelete(session.id)}
                            disabled={disabled}
                            className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-500 transition-colors"
                            title="Xóa biên bản"
                            aria-label="Xóa biên bản"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default SavedSessionsList;