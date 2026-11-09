/**
 * Wander — Zhich, Yu, Justin
 * Sidebar chat: the continuous conversation, streaming render, lasso image
 * bubbles, LaTeX and Markdown rendering, canvas references. Owner: Yu.
 *
 * Placeholder.
 */

import { StyleSheet } from 'react-native';
import {Text, TextInput, View, Pressable} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';

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
        <View style={styles.ChatStyle}>
            
        </View>
    )
}

function BarUi() {
    return (
        <TextInput style={styles.BarStyle} placeholder='Ask anything...'>
            <Pressable onPress={() => console.log()}> // add better onPress 
                <Feather name="plus" size={24} color="black" />
            </Pressable>

            <Pressable onPress={() => console.log()}> // add better onPress 
                <Ionicons name="send" size={24} color="black" />
            </Pressable>
        </TextInput>
        
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