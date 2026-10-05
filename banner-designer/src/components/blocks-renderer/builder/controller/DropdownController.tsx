import * as React from 'react';
import Grow from '@mui/material/Grow';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import { CgEditUnmask } from "react-icons/cg";
import { Box } from '@mui/material';

export default function DropdownController({ children }: { children: React.ReactElement }) {
    const [open, setOpen] = React.useState(false);
    const anchorRef = React.useRef<HTMLButtonElement>(null);

    const handleOpen = () => {

        setOpen(true);
    };
    const handleClose = () => {

        setOpen(false);
    };

    return (
        <div onMouseOver={handleOpen} onMouseLeave={handleClose}>
            <div className='flex justify-center items-center'>
            <CgEditUnmask />
            </div>
            <Popper
                sx={{ zIndex: 1 }}
                open={open}
                anchorEl={anchorRef.current}
                role={undefined}
                transition
                disablePortal
            >
                <div className=''>
                    {children}
                </div>
            </Popper>
        </div>
    );
}