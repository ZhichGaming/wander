/**
 * Wander — Zhich, Yu, Justin
 * Sidebar chat: the continuous conversation, streaming render, lasso image
 * bubbles, LaTeX and Markdown rendering, canvas references. Owner: Yu.
 *
 * Placeholder.
 */

import { StyleSheet } from 'react-native';

export default function Sidebar() {
    return (
        <>
            <ChatOutput />
            <BarUi />
        </>
    );
};

function ChatOutput() {
    return (
        <div style={styles.ChatStyle}>

        </div>
    )
}

function BarUi() {
    return (
        <div style={styles.BarStyle}>
            // add "plus" button and input type="text" placeholder="Ask anything..." 
            // Gemini does input as the base, then "plus" button on the left and send on right
        </div>
    );
}

const styles = StyleSheet.create({
    ChatStyle: {
        display: 'flex', 
        flex: 9,
    },

    BarStyle: {
        display: 'flex', 
        flex: 1, 
        flexDirection: 'row', 
        justifyContent: 'space-around',
    }
})