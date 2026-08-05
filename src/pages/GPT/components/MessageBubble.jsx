import React from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, Video, Link as LinkIcon } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { createCodeRenderers } from '../../../components/markdown/codeRenderers';

const codeRenderers = createCodeRenderers({
  inlineClassName: 'px-1.5 py-0.5 rounded text-sm font-mono bg-gray-200 text-carbon-black',
  preClassName: 'p-3 rounded my-2 overflow-x-auto text-sm font-mono bg-gray-100 text-carbon-black',
});

function MessageBubble({ message, onContentSummary, getMessageRole, getMessageId }) {
  const role = getMessageRole(message);
  
  // Handle content source messages specially
  if (role === 'content_source' && message.contentSource) {
    const source = message.contentSource;
    const isVideo = source.contentType === 'video';
    const IconComponent = source.type === 'file' ? FileText : (isVideo ? Video : LinkIcon);
    
    return (
      <div className="my-6 flex justify-center">
        <div className="bg-white border border-divider rounded-[12px] p-4 max-w-[500px] shadow-sm">
          <div className="flex items-center gap-3">
            <IconComponent className="w-6 h-6 text-pursuit-purple flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-proxima text-gray-500 uppercase">
                  {source.contentType}
                </span>
              </div>
              <h4 className="text-sm font-proxima font-semibold text-carbon-black truncate">
                {source.type === 'file' ? source.fileName : source.title}
              </h4>
              {source.url && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-proxima text-pursuit-purple hover:underline"
                >
                  View original →
                </a>
              )}
            </div>
            <Button
              onClick={() => onContentSummary(source)}
              className="flex-shrink-0 h-8 px-3 text-xs bg-pursuit-purple hover:bg-pursuit-purple/90 text-white"
            >
              View Summary
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Handle system content summary messages (from persisted messages)
  if (role === 'system_content_summary') {
    const content = message.content;
    let source = {};
    
    if (content.startsWith('File uploaded:')) {
      const lines = content.split('\n');
      const fileName = lines[0].replace('File uploaded: ', '');
      const summary = lines.slice(1).join('\n').replace('Summary: ', '');
      
      source = {
        id: getMessageId(message),
        type: 'file',
        fileName: fileName,
        title: `${fileName} Summary`,
        summary: summary,
        contentType: 'document',
        processedAt: message.created_at
      };
    } else if (content.includes(' processed:')) {
      const lines = content.split('\n');
      const firstLine = lines[0];
      const isVideo = firstLine.startsWith('Video processed:');
      const title = firstLine.replace(/^(Video|Article) processed: /, '');
      const url = lines.find(line => line.startsWith('URL: '))?.replace('URL: ', '');
      const summary = lines.slice(lines.findIndex(line => line.startsWith('Summary: '))).join('\n').replace('Summary: ', '');
      
      source = {
        id: getMessageId(message),
        type: 'url',
        title: title,
        summary: summary,
        url: url,
        contentType: isVideo ? 'video' : 'article',
        processedAt: message.created_at
      };
    }
    
    // Only render if we successfully parsed the content
    if (source.summary) {
      const isVideo = source.contentType === 'video';
      const IconComponent = source.type === 'file' ? FileText : (isVideo ? Video : LinkIcon);
      
      return (
        <div className="my-6 flex justify-center">
          <div className="bg-white border border-divider rounded-[12px] p-4 max-w-[500px] shadow-sm">
            <div className="flex items-center gap-3">
              <IconComponent className="w-6 h-6 text-pursuit-purple flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-proxima text-gray-500 uppercase">
                    {source.contentType}
                  </span>
                </div>
                <h4 className="text-sm font-proxima font-semibold text-carbon-black truncate">
                  {source.type === 'file' ? source.fileName : source.title}
                </h4>
                {source.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-proxima text-pursuit-purple hover:underline"
                  >
                    View original →
                  </a>
                )}
              </div>
              <Button
                onClick={() => onContentSummary(source)}
                className="flex-shrink-0 h-8 px-3 text-xs bg-pursuit-purple hover:bg-pursuit-purple/90 text-white"
              >
                View Summary
              </Button>
            </div>
          </div>
        </div>
      );
    }
    
    // If parsing failed, don't render anything
    return null;
  }

  // Regular user or assistant messages - Learning page style (no bubbles, just markdown)
  return (
    <div className="mb-6">
      <div className="text-carbon-black leading-relaxed text-base font-proxima">
        <ReactMarkdown
          components={{
            p: ({ node, children, ...props }) => (
              <p className="mb-0" {...props}>{children}</p>
            ),
            h1: ({ node, children, ...props }) => (
              <h1 className="text-xl font-semibold mt-4 mb-2 first:mt-0 text-carbon-black" {...props}>{children}</h1>
            ),
            h2: ({ node, children, ...props }) => (
              <h2 className="text-lg font-semibold mt-3 mb-2 first:mt-0 text-carbon-black" {...props}>{children}</h2>
            ),
            h3: ({ node, children, ...props }) => (
              <h3 className="text-base font-semibold mt-2 mb-1 first:mt-0 text-carbon-black" {...props}>{children}</h3>
            ),
            ul: ({ node, children, ...props }) => (
              <ul className="list-disc pl-5 my-2 text-carbon-black" {...props}>{children}</ul>
            ),
            ol: ({ node, children, ...props }) => (
              <ol className="list-decimal pl-5 my-2 text-carbon-black" {...props}>{children}</ol>
            ),
            li: ({ node, children, ...props }) => (
              <li className="my-1 text-carbon-black" {...props}>{children}</li>
            ),
            a: ({ node, children, ...props }) => (
              <a className="text-blue-500 hover:underline break-all" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
            ),
            code: codeRenderers.code,
            pre: codeRenderers.pre,
            blockquote: ({ node, children, ...props }) => (
              <blockquote
                className="border-l-4 border-gray-300 pl-4 my-2 italic text-gray-700"
                {...props}
              >
                {children}
              </blockquote>
            ),
            table: ({ node, children, ...props }) => (
              <table className="border-collapse w-full my-4 text-carbon-black" {...props}>
                {children}
              </table>
            ),
            thead: ({ node, children, ...props }) => (
              <thead className="bg-gray-100" {...props}>
                {children}
              </thead>
            ),
            tbody: ({ node, children, ...props }) => (
              <tbody {...props}>
                {children}
              </tbody>
            ),
            tr: ({ node, children, ...props }) => (
              <tr className="border-b border-gray-200" {...props}>
                {children}
              </tr>
            ),
            th: ({ node, children, ...props }) => (
              <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-carbon-black" {...props}>
                {children}
              </th>
            ),
            td: ({ node, children, ...props }) => (
              <td className="border border-gray-300 px-4 py-2 text-carbon-black" {...props}>
                {children}
              </td>
            ),
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default MessageBubble;

