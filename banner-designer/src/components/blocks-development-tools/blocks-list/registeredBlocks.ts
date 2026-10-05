export interface BlockElementIdentifier {
    tag: string,
    name: string,
    id: string,
    classList: string,
    systemAddedClass: string,
    parentId: string,
    style: any,
    text?: string,
    attributes?: Record<string, string>,
    child?: string[],
}
export interface BlockElementIdentifierWithCategory {
    category: string,
    blocks: any
}

const branch = (styles: Record<string, string> = {}) => ({
    styles,
    custom: '',
    hover: {},
});

const theme = (defaultStyles: Record<string, string> = {}) => ({
    light: {
        default: branch(defaultStyles),
        '478px': branch(),
        '767px': branch(),
        '991px': branch(),
        '1280px': branch(),
        '1440px': branch(),
        '1920px': branch(),
    },
});

// Elements dropped onto the artboard (body) are absolutely positioned.
const onCanvas = (extra: Record<string, string> = {}) => ({
    position: 'absolute',
    left: '40px',
    top: '40px',
    ...extra,
});

const el = (partial: Partial<BlockElementIdentifier> & { tag: string; name: string }, styles: Record<string, string>): BlockElementIdentifier => ({
    id: '',
    classList: '',
    systemAddedClass: '',
    parentId: '',
    style: theme(styles),
    child: [],
    ...partial,
});

const registeredBlocks: BlockElementIdentifierWithCategory[] = [
    {
        category: 'Text',
        blocks: [
            el({ tag: 'h1', name: 'Headline', text: 'Headline' }, onCanvas({
                'font-size': '64px', 'font-weight': '700', 'line-height': '1.1',
                color: '#111111', margin: '0px',
            })),
            el({ tag: 'h2', name: 'Subheading', text: 'Subheading' }, onCanvas({
                'font-size': '32px', 'font-weight': '600', 'line-height': '1.2',
                color: '#333333', margin: '0px',
            })),
            el({ tag: 'p', name: 'Paragraph', text: 'Body text' }, onCanvas({
                'font-size': '18px', 'line-height': '1.5', color: '#444444', margin: '0px',
            })),
            el({ tag: 'span', name: 'Label', text: 'Label' }, onCanvas({
                'font-size': '14px', 'letter-spacing': '2px', 'text-transform': 'uppercase',
                color: '#666666',
            })),
        ],
    },
    {
        category: 'Elements',
        blocks: [
            el({ tag: 'button', name: 'Button', text: 'Call to action' }, onCanvas({
                'font-size': '18px', 'font-weight': '600', color: '#ffffff',
                'background-color': '#111111', border: 'none', 'border-radius': '8px',
                padding: '14px 32px', cursor: 'pointer',
            })),
            el({
                tag: 'img', name: 'Image',
                attributes: { src: 'https://picsum.photos/seed/banner/400/300', alt: 'image' },
            }, onCanvas({
                width: '400px', height: '300px', 'object-fit': 'cover',
            })),
            el({ tag: 'div', name: 'Rectangle' }, onCanvas({
                width: '200px', height: '120px', 'background-color': '#e5e5e5',
            })),
            el({ tag: 'div', name: 'Container' }, onCanvas({
                width: '400px', height: '240px', 'background-color': 'transparent',
            })),
        ],
    },
    {
        category: 'Shapes',
        blocks: [
            el({ tag: 'div', name: 'Circle' }, onCanvas({
                width: '160px', height: '160px', 'border-radius': '50%',
                'background-color': '#6366f1',
            })),
            el({ tag: 'div', name: 'Pill' }, onCanvas({
                width: '220px', height: '56px', 'border-radius': '9999px',
                'background-color': '#f59e0b',
            })),
            el({ tag: 'div', name: 'Divider' }, onCanvas({
                width: '320px', height: '3px', 'background-color': '#111111',
            })),
        ],
    },
];

export default registeredBlocks;
